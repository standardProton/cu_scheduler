import styles from "styles/Main.module.css";
import { QUARTER_MAX } from "lib/json/consts.js";

export default function Schedule({width, height, schedule, color_key, setColorKey, scheduleClick, scheduleHover, options}) {
    const marginx_right = 5, marginx_left = 9000/width, marginy_top = 7, marginy_bottom = 2.5; //percent
    //to add back login link, set marginy_top=4, day text y=2.75%
    const w = (100 - (marginx_left + marginx_right)), h = (100 - (marginy_top + marginy_bottom));
    const daylen = 12.75; //10.75

    const getX = (i) => {return (marginx_left + (i*w/5.0))}
    const getY = (i) => {return ((i*h/daylen) + marginy_top)}

    //const colors = ["#666A86", "#788AA3", "#92B6B1", "#B2C9AB", "#E8DDB5"] //slate palette

    //const color_key = {};
    var color_count = Object.entries(color_key).length % 5;

    var us = null, ue = null;
    if (options.ut_start != undefined && options.ut_start.length == 2 && options.ut_end != undefined && options.ut_end.length == 2){
        us = [Math.min(options.ut_start[0], options.ut_end[0]), Math.min(options.ut_start[1], options.ut_end[1])];
        ue = [Math.max(options.ut_start[0], options.ut_end[0]), Math.max(options.ut_start[1], options.ut_end[1])];
    }

    const r = (
        <svg width={width} height={1.7*height}>

            {schedule != null && (<><g className={styles.avoid_times}>
                {schedule.avoid_times.map((hours_list, i) => (<g key={"avoid-day-" + i}>
                    {hours_list.map((hour_set, j) => {
                    if (hour_set.length < 2) return (<g key={"avoid-" + i + "-" + j}></g>);

                    return (<g key={"avoid-" + i + "-" + j}>
                        <rect x={getX(i) + "%"} y={getY(hour_set[0]/12.0) + "%"} height={(getY(hour_set[1]/12.0) - getY(hour_set[0]/12.0)) + "%"} width={(w/5) + "%"}></rect>
                    </g>)})}
                </g>))}
            </g>
            </>)}

            {(us != null) && (
                <rect x={getX(us[0]) + "%"} y={getY(us[1]/12) + "%"} width={((w/5.0)*(Math.max(1, ue[0] - us[0] + 1))) + "%"} height={(getY(ue[1]/12) - getY(us[1]/12)) + "%"} className={styles.avoid_times}></rect>
            )}

            <g fill="white">
                {Array.from(new Array(13), (x, i) => i).map(i => (<g key={"horizontal-" + i}>
                    <rect x={(marginx_left) + "%"} y={getY(i) + "%"} height="2" width={w + "%"}></rect>
                    <text x={(0.2*marginx_left) + "%"} y ={(getY(i) + 1) + "%"}>{(((i+7) % 12) + 1) + ":00"}</text>
                </g>))}
                {Array.from(new Array(6), (x, i) => i).map(i => (<g key={"vertical-" + i}>
                    <rect x={getX(i) + "%"} y={marginy_top + "%"} width="2" height={h + "%"}></rect>
                </g>))}
                {["M", "T", "W", "Th", "F"].map((day, i) => (<g key={"day-label-" + i}>
                    <text x={(getX(i) + (w/10) - 0.5) + "%"} y="4.5%" width="2" height={h + "%"}>{day}</text>
                </g>))}
            </g>

            {schedule != null && (<>
            <g>
                {schedule.classes.map((cl, i) => (<g key={"class-set-" + i}>
                    {cl.meeting_times.map(meeting_time => {
                        var x = getX(meeting_time.day) + 0.14, y = getY(meeting_time.start_time/12.0) + 0.08;
                        //style={{fill: colors[i % colors.length]}}

                        var color_num = color_key[cl.title];
                        if (color_num == undefined) {
                            color_num = color_count;
                            color_key[cl.title] = color_num;
                            color_count = (color_count+1) % 5;
                        }

                        var rect_width = (w/5) - 0.14;
                        if (cl.quarter != null){
                            rect_width /= QUARTER_MAX;
                            x += rect_width*cl.quarter;
                        }

                        return (<g key={"class-" + i + "-day-" + meeting_time.day}>
                        <rect x={x + "%"} y={y + "%"} width={rect_width + "%"} 
                        height={(getY(meeting_time.end_time/12.0) - y) + "%"} 
                        className={styles["palette-" + color_num]} rx="6" ry="6"></rect>
                        
                        <g style={{fill: "#FFF"}} fontSize={width > 900 ? "13pt" : "8pt"}>
                            <text x={(x+0.5) + "%"} y={(y+2.4) + "%"} fontWeight="bold">{cl.title}</text>
                            <text x={(x+0.5) + "%"} y={(y+5) + "%"}>{((width > 590 && cl.quarter == null) ? "Section " : "") + cl.section + (width > 400 ? " (" + cl.type + ")" : "")}</text>
                        </g>
                        </g>)
                    })}
                </g>))}
            </g>
            </>)}

            <g>
                {Array.from(new Array(5), (x, i) => i).map(xc => (<g key={"click-event-set-" + xc}>
                    {Array.from(new Array(Math.trunc(daylen*12)), (x, i) => i).map(yc => (
                        <rect x={getX(xc) + "%"} y={getY(yc/12)+ "%"} width={(w/5) + "%"} height={(h/daylen/12) + "%"} 
                        onMouseDown={() => scheduleClick(xc, yc)} onMouseUp={() => {if (options.scheduleClickUp != undefined) options.scheduleClickUp(xc, yc)}} onMouseOver={() => scheduleHover(xc, yc)} key={"click-event-" + xc + "-" + yc} style={{fill: "rgba(0, 0, 0, 0)", cursor: "crosshair"}}></rect>
                    ))}
                </g>))}
            </g>
            {(schedule != null && options.removeUT != undefined) && (<><g>
                {schedule.avoid_times.map((hours_list, i) => (<g key={"avoid-x-day-" + i}>
                    {hours_list.map((hour_set, j) => {
                    if (hour_set.length < 2) return (<g key={"avoid-x-" + i + "-" + j}></g>);
                    
                    //render the x button to remove an unavailable time
                    return (<g key={"avoid-x-" + i + "-" + j}>
                        <image x={"calc(" + getX(i+1) + "% - 20px)"} y={"calc(" + getY(hour_set[0]/12.0) + "% + 5px)"} height="14" width="14" href="/icons/close.png" style={{cursor: "pointer"}} alt="Delete Time" onClick={()=> options.removeUT(i, j)}></image>
                    </g>)})}
                </g>))}
            </g>
            </>)}

        </svg>
    )
    setColorKey(color_key);
    return r;
}