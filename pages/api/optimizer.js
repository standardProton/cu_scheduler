import { isRangeIntersection, isSameSchedule } from "../../lib/utils";
import solver from "javascript-lp-solver/src/solver";
import { MAX_MODEL_TIME } from "../../lib/json/consts";

export function randomCost(i){ //basic seeded pseudorandom function
    const n = Math.pow(i + 8, 2)*(100/9.0)*Math.E;
    return 10*(n - Math.trunc(n)) - 5;
}

export async function solve(model, preschedule, random_itr){ //run model and parse results

    //add random noise to costs
    let random_itr2 = 0;
    for (const [var_name, val] of Object.entries(model.variables)){
        model.variables[var_name].cost = model.variables[var_name].cost_orig + randomCost(random_itr + random_itr2);
        random_itr2++;
    }

    //if (random_itr == 0) console.log(model);
    //console.log(model.variables);

    const solved = solver.Solve(model)

    var final_schedule = [];
    const added_classes = [];

    for (const [var_name, val] of Object.entries(solved)){
        const var_split = var_name.split("-");
        if (var_split.length == 2){ //class result (xxxx 1234)
            const class_num = parseInt(var_split[0].substring(1)), offering_num = parseInt(var_split[1].substring(1));
            const add_class = preschedule[class_num].offerings[offering_num]; //parse results from model and get class data

            add_class.title = preschedule[class_num].title;
            add_class.type = preschedule[class_num].type;

            if (!solved.feasible){
                return {feasible: false, classes: []} //TODO: Determine which class is conflicting
                //classes is empty because model will return erraneous results
            }
            
            for (let i = 0; i < add_class.meeting_times.length; i++){
                added_classes.push(add_class.title + " " + add_class.type);
            }

            final_schedule.push(add_class);
        }
    }

    return {feasible: true, classes: final_schedule}
}

export default async function handler(req, res){

    try{
        if (req.method != "POST"){
            res.status(405).json({error_msg: "Must be 'POST' method!"});
            return;
        }

        if (req.body == undefined || req.body == ""){
            res.status(406).json({error_msg: "Missing request body"});
            return;
        }

        var data = null;
        try {
            data = JSON.parse(req.body);
        } catch (ex){
            res.status(406).json({error_msg: "Invalid JSON format for request body"});
            return;
        }

        if (data.avoid_times == undefined || data.preschedule == undefined) {
            res.status(406).json({error_msg: "Body must contain 'current_schedule', 'current_schedule.avoid_times', and 'preschedule'!"});
            return;
        }
        const avoid_times = data.avoid_times, preschedule = data.preschedule;
        if (avoid_times.length != 5){
            res.status(406).json({error_msg: "Malformatted avoid_times: Must have an entry for each day."});
            return;
        }
        let avoid_total = 0;
        for (let i = 0; i < avoid_times.length; i++){
            avoid_total += avoid_times[i].length;
            if (avoid_total > 20){
                res.status(406).json({error_msg: "Exceeded the maximum number of avoid time ranges!"});
                return;
            }
        }
        if (preschedule.length > 12){
            res.status(406).json({error_msg: "Exceeded the maximum number of classes!"});
            return;
        }
        if (preschedule.length == 0){
            res.status(406).json({error_msg: "Preschedule is empty."});
            return;
        }

        const min_enroll_count = data.min_enroll_count == undefined ? preschedule.length : Math.min(data.min_enroll_count, preschedule.length);
        const model = { //initial model and constraints
            optimize: "cost",
            opType: "min",
            constraints: {
                enrolled_count: {min: min_enroll_count, max: min_enroll_count}
            },
            variables: {},
            ints: {}
        }

        //preprocess preschedule data, determine if using semesters or quarters
        let quarters = null; //null if all classes fit whole semester, otherwise max # of quarters
        for (let i = 0; i < preschedule.length; i++){
            if (preschedule[i].title == undefined || preschedule[i].offerings == undefined || preschedule[i].offerings.length == 0){
                res.status(406).json({error_msg: "Malformatted preschedule object (Index " + i + ")"});
                return;
            }
            for (let j = 0; j < Math.min(preschedule[i].offerings.length, 65); j++){
                const qu = preschedule[i].offerings[j].quarter;
                if (qu != null && qu > 0) {
                    if (quarters == null) quarters = qu;
                    else if (qu > quarters) quarters = qu;

                    break;
                }
            }
        }

        const avoid_waitlist = data.avoid_waitlist == undefined ? true : data.avoid_waitlist;

        for (let i = 0; i < preschedule.length; i++){ //each class to be scheduled

            const title = preschedule[i].title.toUpperCase();

            model.constraints["c" + i + "-enrolled"] = {min: 0, max: 1};

            for (let j = 0; j < Math.min(preschedule[i].offerings.length, 65); j++){ //each offering in class
                const offering = preschedule[i].offerings[j];
                const model_var = {enrolled_count: 1, cost: 0, cost_orig: 0} //boolean cost
                model_var["c" + i + "-enrolled"] = 1;

                if (offering.full && avoid_waitlist) {
                    model_var.cost_orig += 30; //avoid waitlist
                }

                //avoid professor
                if (preschedule[i].avoid_instructors != undefined && preschedule[i].avoid_instructors.includes(offering.instructor)) {
                    model_var.cost_orig += 30;
                }

                if (offering.meeting_times == undefined){ //if len 0, class is async
                    res.status(406).json({error_msg: "Class '" + title + "' offering #" + j + " does not define 'meeting_times'!"});
                    return;
                }

                let ut_count = 0; //number of times an offering has any intersection with unavailable times
                for (let k = 0; k < offering.meeting_times.length; k++){ //for each time class meets in the week
                    const mtime = offering.meeting_times[k];
                    if (mtime.day == undefined || mtime.day < 0 || mtime.day > 4 || mtime.start_time == undefined || mtime.end_time == undefined || mtime.start_time < 0 || mtime.start_time > MAX_MODEL_TIME-1 || mtime.end_time <= mtime.start_time || mtime.end_time > MAX_MODEL_TIME){
                        res.status(406).json({error_msg: "Malformatted meeting time in class '" + title + " offering " + j + " meeting time " + k + "! Check that the day, start_time, and end_time are correct."});
                        return;
                    }

                    if (isRangeIntersection([mtime.start_time, mtime.end_time], avoid_times[mtime.day])) ut_count++; //if class is in unavailable times
                    
                    for (let time_itr = mtime.start_time; time_itr <= mtime.end_time + 1; time_itr++){ //every 5 min chunk in 1 class's meeting
                        if (offering.quarter != null){ //if quarterly class
                            model_var["d" + mtime.day + "-t" + time_itr + "-q" + offering.quarter] = 1; //model time (0-MAX_MODEL_TIME), also books 5 mins after class ends
                            model.constraints["d" + mtime.day + "-t" + time_itr + "-q" + offering.quarter] = {min: 0, max: 1};
                        } else {
                            if (quarters == null){ //no quarters to consider for any class
                                model_var["d" + mtime.day + "-t" + time_itr] = 1; 
                                model.constraints["d" + mtime.day + "-t" + time_itr] = {min: 0, max: 1};
                            } else {
                                for (let qi = 0; qi <= quarters; qi++){ //not a quarterly class, but takes all quarters in semester
                                    model_var["d" + mtime.day + "-t" + time_itr + "-q" + qi] = 1; 
                                    model.constraints["d" + mtime.day + "-t" + time_itr + "-q" + qi] = {min: 0, max: 1};
                                }
                            }
                        }
                    }
                }

                model_var.cost_orig += ut_count*50; 

                model.variables["c" + i + "-o" + j] = model_var;
                model.ints["c" + i + "-o" + j] = 1;
            }
        }

        //console.log(model.variables);

        const schedules = [], start = (new Date()).getTime();

        var random_itr = 0;
        while (schedules.length < 10 && random_itr < 30){ //make up to 10 variations by adding small bit of randomness to costs
            const solved = await solve(model, preschedule, random_itr);

            var duplicate = false;

            if (!solved.feasible){
                res.status(200).json({conflictions: true, schedule_count: 0, schedules: []});
                return;
            }

            for (let j = 0; j < schedules.length; j++){
                if (isSameSchedule(schedules[j], solved)) {
                    duplicate = true;
                    break;
                }
            }

            if (!duplicate){
                schedules.push(solved);
            }
            random_itr++;
        }

        //console.log("Took " + ((new Date()).getTime() - start) + "ms");

        //res.status(200).json({conflictions: solved.feasible ? 0 : min_enroll_count - solved.final_schedule.length, final_schedule: solved.final_schedule});
        res.status(200).json({conflictions: false, schedule_count: schedules.length, schedules});

    }
    catch(ex){
        res.status(500).json({error_msg: "Internal Server Error"});
        console.error(ex);
    }
}