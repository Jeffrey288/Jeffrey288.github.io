function compileTJA(tja) {
    return new Chart(tja);
}

enum NoteType {
    DON,
    KA,
    BIG_DON,
    BIG_KA,
    BALLOON,
    RENDA,
    BIG_RENDA,
}

interface Metadata {
    TITLE: string | null;
    SUBTITLE: string | null;
    BPM: number | null;
    WAVE: string | null;
    OFFSET: number;
    DEMOSTART: number;
    SONGVOL: number;
    SEVOL: number;
    SCOREMODE: number;
    GENRE: string | null;
}

interface CourseMetadata {
    COURSE: string;
    LEVEL: number;
    BALLOON: number[];
    SCOREINIT: number | null;
    SCOREDIFF: number | null;
}

class Chart {
    public metadata: Metadata;
    public courses: Record<string, [CourseMetadata, any]>;
    public tja: string;

    constructor(tja: string) {
        this.tja = tja;
        this.metadata = {
            TITLE: null,
            SUBTITLE: null,
            BPM: null,
            WAVE: null,
            OFFSET: 0.0,
            DEMOSTART: 0.0,
            SONGVOL: 100.0,
            SEVOL: 100.0,
            SCOREMODE: 0,
            GENRE: null,
        };
        this.courses = {};
        this.parseFile(this.tja);
    }

    private _parseKeyVal(line: string): [string, string] {
        const [attr, val] = line.trim().split(":", 2);
        return [attr.trim(), val.trim()];
    }

    private _parseSharp(line: string): string[] {
        return line.slice(1).trim().split(" ");
    }

    private _throwError(lineNo: number, line: string, message: string): never {
        throw new Error(`Line ${lineNo}: ${message}\n\t\t${line}`);
    }

    private _logWarning(lineNo: number, line: string, message: string): void {
        console.warn(`Line ${lineNo}: ${message}\n\t\t${line}`);
    }

    public parseFile(file: string): void {
        const lines = file.split('\n').map((line, index) => [index, line] as [number, string]);
        let courseMetadata: CourseMetadata | null = null;
        let courseChart: any[] | null = null;
        let state: string = "METADATA";
        let curLineNo: number = 0;

        while (curLineNo < lines.length) {
            var [lineNo, line] = lines[curLineNo];
            // console.log(line);

            // Santize line by removing eveyrthing after the first //
            line = line.split('//')[0].trim();

            // Ignore whitespaces and comments
            if (line !== '') {
                
                if (state === "METADATA") {
                    if (line.includes(":")) {
                        const [attr, val] = this._parseKeyVal(line);
                        if (attr === "COURSE") {
                            if (!["EDIT", "ONI", "HARD", "NORMAL", "EASY"].includes(val.toUpperCase())) {
                                this._throwError(lineNo, line, `invalid course: ${val}`);
                            }
                            courseMetadata = {
                                COURSE: val.toUpperCase(),
                                LEVEL: 1,
                                BALLOON: [],
                                SCOREINIT: null,
                                SCOREDIFF: null,
                            };
                            state = "COURSE_METADATA";
                        } else if (val !== '') {
                            if (["TITLE", "SUBTITLE", "WAVE", "GENRE"].includes(attr)) {
                                this.metadata[attr] = val;
                            } else if (["BPM", "OFFSET", "DEMOSTART", "SONGVOL", "SEVOL", "SCOREMODE"].includes(attr)) {
                                this.metadata[attr] = parseFloat(val);
                            } else {
                                this._logWarning(lineNo, line, `unknown metadata: ${attr}`);
                            }
                        }
                    } else {
                        this._throwError(lineNo, line, `invalid format`);
                    }
                } else if (state === "COURSE_METADATA") {
                    if (line.includes(":")) {
                        const [attr, val] = this._parseKeyVal(line);
                        if (val !== '') {
                            if (["LEVEL", "SCOREINIT", "SCOREDIFF"].includes(attr)) {
                                courseMetadata![attr] = parseInt(val);
                            } else if (attr === "BALLOON") {
                                courseMetadata!.BALLOON = val.split(',').map(Number);
                            }
                        }
                    } else if (line.startsWith('#')) {
                        const vals = this._parseSharp(line);
                        if (vals.length != 1 || vals[0] !== "START") {
                            this._throwError(lineNo, line, `missing #START statement`);
                        }
                        if (this.metadata.BPM === null) {
                            this._throwError(lineNo, line, `missing BPM`);
                        }

                        // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html
                        let { 
                                endLineNo: endLineNo, 
                                chart: chart 
                            } = this.parseCourse(lines, curLineNo + 1, courseMetadata!, this.metadata.BPM);
                        
                        this.courses[courseMetadata!.COURSE] = [courseMetadata!, chart];
                        curLineNo = endLineNo;
                        
                        // let startLineNo: number = curLineNo;
                        // let endLineNo: number = curLineNo;
                        // // find #END statement
                        // while (endLineNo < lines.length) {
                        //     const [, endLine] = lines[endLineNo];
                        //     if (endLine.startsWith('#')) {
                        //         const vals = this._parseSharp(endLine);
                        //         if (vals[0] === "END") {
                        //             break;
                        //         }
                        //     }
                        //     endLineNo++;
                        // }
                        // if (endLineNo >= lines.length) {
                        //     this._throwError(endLineNo, "", `reached EOF without #END statement`);
                        // }
                        // // courseChart = this.parseCourse(lines.slice(startLineNo, endLineNo), startLineNo, courseMetadata!, this.metadata.BPM);
                        // curLineNo = endLineNo;

                        // courseChart = this.parseCourse(lines.slice(lineNo), lineNo, courseMetadata!, this.metadata.BPM);
                        // this.courses[courseMetadata.COURSE] = [courseMetadata, courseChart];
                        courseMetadata = null;
                        courseChart = null;
                        state = "METADATA";
                    } else {
                        this._throwError(lineNo, line, `invalid format`);
                    }
                }

            }

            curLineNo++;
        }

        if (state !== "METADATA") {
            this._throwError(curLineNo, "", `reached EOF without #START statement`);
        }

        console.log(this.metadata);
        console.log(this.courses);
    }

    private parseCourse(lines: [number, string][], startLineNo: number, courseMetadata: CourseMetadata, initBpm: number) {
        // Ignoring gogostart and gogoend
        const balloons: number[] = courseMetadata.BALLOON; // on default give 5 balloons

        interface ChartState {
            measure: [number, number];
            bpm: number;
            scroll: number;
            showBarline: boolean;
            balloonCount: number;
            curTime: number;
            curBar: number;
            curNote: number;
            combo: 0;
            gogo: boolean;
        }
        let endLineNo: number | null = null;

        // first pass: find the number of notes and measure in each bar and, and end position of the course
        interface Bar {
            num_notes: number;
            measure: [number, number];
        };
        
        let chartState: ChartState = {
            measure: [4, 4],
            bpm: initBpm,
            scroll: 1,
            showBarline: true,
            curTime: 0,
            curBar: 0,
            curNote: 0,
            combo: 0,
            balloonCount: 0,
            gogo: false,
        };
        
        let bars: Bar[] = [];
        let curBar: Bar = { num_notes: 0, measure: [4, 4] };
        
        let curLineNo: number = startLineNo;
        while (curLineNo < lines.length) {
            let [lineNo, line] = lines[curLineNo];
            // console.log(line);

            line = line.split('//')[0].trim();
            if (line !== '') { 
                if (line.startsWith('#')) {
                    const vals = this._parseSharp(line);
                    if (vals.length == 1 && vals[0] === "END") {
                        if (curBar.num_notes > 0) {
                            this._throwError(lineNo, line, `incomplete bar`);
                        }
                        endLineNo = lineNo; // we found the end of the course
                        break;
                    } else if (vals.length == 2 && vals[0] === "MEASURE") {
                        let [num, den] = vals[1].split('/').map(Number);
                        if (num <= 0 || den <= 0) {
                            this._throwError(lineNo, line, `invalid measure`);
                        }
                        if (curBar.num_notes > 0) {
                            this._throwError(lineNo, line, `measure change in the middle of a bar`);
                        }
                        curBar.measure = [num, den];
                        chartState.measure = [num, den];
                    }
                } else {
                    for (let char of line) {
                        if (char >= '0' && char <= '9') {
                            curBar.num_notes++;
                        } else if (char === ',') {
                            bars.push(curBar);
                            curBar = { num_notes: 0, measure: chartState.measure };
                            chartState.curBar++;
                        } else {
                            this._throwError(lineNo, line, `invalid character: ${char}`);
                        }
                    }
                }
            }
            curLineNo++;
        }
        if (curLineNo >= lines.length || endLineNo === null) {
            this._throwError(curLineNo, "", `reached EOF without #END statement`);
        }
        
        console.log(bars);

        // second pass: parse the timestamp of notes and barlines
        chartState = {
            measure: [4, 4],
            bpm: initBpm,
            scroll: 1,
            showBarline: true,
            curTime: 0,
            curBar: 0,
            curNote: 0,
            combo: 0,
            balloonCount: 0,
            gogo: false,
        };

        type NormalNoteType = NoteType.DON | NoteType.KA | NoteType.BIG_DON | NoteType.BIG_KA;
        type LongNoteType = NoteType.BALLOON | NoteType.RENDA | NoteType.BIG_RENDA;
        type RendaNoteType = NoteType.RENDA | NoteType.BIG_RENDA;
        interface Note {
            id: string;
            type: NoteType;
            hitTime: number;
            appearTime: number;
            speed: number;
        }
        interface NormalNote extends Note {
            type: NormalNoteType; 
            combo: number;
        }
        interface LongNote extends Note {
            type: LongNoteType;
            length: number;
            endTime: number;
        }
        interface RendaNote extends LongNote {
            type: RendaNoteType;
        }
        interface BalloonNote extends LongNote {
            type: NoteType.BALLOON;
            count: number;
        }
        interface Barline {
            id: number;
            time: number;
            speed: number;
        }
        
        let chartStates: ChartState[] = [];
        let barlines: Barline[] = [];
        let notes: Note[] = [];
        let activeLongNote: LongNote | null = null;

        for (curLineNo = startLineNo; curLineNo < endLineNo; curLineNo++) { // just one pass is enough
            let [lineNo, line] = lines[curLineNo];
            
            line = line.split('//')[0].trim();
            if (line !== '') {
                if (line.startsWith('#')) {
                    const vals = this._parseSharp(line);
                    if (vals.length === 1) { // no need to check END
                        if (vals[0] === "GOGOSTART") {
                            chartState.gogo = true;
                        } else if (vals[0] === "GOGOEND") {
                            chartState.gogo = false;
                        } else if (vals[0] === "BARLINEOFF") {
                            chartState.showBarline = false;
                        } else if (vals[0] === "BARLINEON") {
                            chartState.showBarline = true;
                        } else {
                            this._throwError(lineNo, line, `unknown command: ${vals[0]}`);
                        }
                    } else if (vals.length === 2) {
                        if (vals[0] === "BPMCHANGE") {
                            chartState.bpm = parseFloat(vals[1]);
                        } else if (vals[0] === "SCROLL") {
                            chartState.scroll = parseFloat(vals[1]);
                        } else if (vals[0] === "MEASURE") {
                            let [num, den] = vals[1].split('/').map(Number); 
                            chartState.measure = [num, den];
                        } else {
                            this._throwError(lineNo, line, `unknown command: ${vals[0]}`);
                        }
                    } else {
                        this._throwError(lineNo, line, `invalid format`);
                    }
                    // console.log(chartState);
                } else {
                    for (let char of line) {

                        // screen shows eaxctly 1 bar of 4/4 measure, barline to barline
                        // normal note in a 4/4 measure should travel the whole screen in 1 bar
                        let speed = 1 / (60.0 / chartState.bpm / 4) * chartState.scroll;
                        let lengthOfBar = 60.0 / chartState.bpm * 4 * chartState.measure[0] / chartState.measure[1];
                        let lengthPerNote = lengthOfBar / bars[chartState.curBar].num_notes;      
                            
                        if (!((char >= '0' && char <= '9') || char === ',')) {
                            this._throwError(lineNo, line, `invalid character: ${char}`);
                        }

                        if (chartState.curTime === 0) {
                            if (chartState.showBarline) {
                                barlines.push({
                                    id: -1,
                                    time: chartState.curTime,
                                    speed: speed,
                                });
                            }
                            chartStates.push({...chartState}); // makes a copy of the current chartState
                        }

                        // push chart state
                        // TODO

                        if (char >= '0' && char <= '9') {

                            if (activeLongNote != null && char != '0' && char != '8') {
                                this._logWarning(lineNo, line, `long note not terminated before starting new note`);
                                // TODO: change this later on
                                activeLongNote.endTime = chartState.curTime - lengthPerNote;
                                activeLongNote.length = activeLongNote.endTime - activeLongNote.hitTime;
                                notes.push(activeLongNote);

                                activeLongNote = null;
                            }
                           
                            if (char == '0') {
                                // no need to do anything
                            } else if (char >= '1' && char <= '4') {
                                let noteType: NormalNoteType;
                                switch (char) {
                                    case '1': noteType = NoteType.DON; break;
                                    case '2': noteType = NoteType.KA; break;
                                    case '3': noteType = NoteType.BIG_DON; break;
                                    case '4': noteType = NoteType.BIG_KA; break;
                                }
                                let note: NormalNote = {
                                    id: `${chartState.curBar}-${chartState.curTime}`, // not really useful
                                    type: noteType!,
                                    hitTime: chartState.curTime,
                                    appearTime: 0, // not used yet
                                    speed: speed,
                                    combo: ++chartState.combo,
                                };
                                notes.push(note);
                            } else if (char == '5' || char == '6') {
                                let noteType: RendaNoteType;
                                switch (char) {
                                    case '5': noteType = NoteType.RENDA; break;
                                    case '6': noteType = NoteType.BIG_RENDA; break;
                                }
                                activeLongNote = {
                                    id: `${chartState.curBar}-${chartState.curTime}`, // not really useful
                                    type: noteType,
                                    hitTime: chartState.curTime,
                                    appearTime: 0, // not used yet
                                    speed: speed,
                                    length: 0,
                                    endTime: chartState.curTime,
                                } as RendaNote;
                            } else if (char == '7' || char == '9') {
                                if (chartState.balloonCount >= balloons.length) {
                                    this._throwError(lineNo, line, `too many balloons`);
                                }
                                let count = balloons[chartState.balloonCount++];
                                activeLongNote = {
                                    id: `${chartState.curBar}-${chartState.curTime}`, // not really useful
                                    type: NoteType.BALLOON,
                                    hitTime: chartState.curTime,
                                    appearTime: 0, // not used yet
                                    speed: speed,
                                    length: 0,
                                    endTime: chartState.curTime,
                                    count: count,
                                } as BalloonNote;
                            } else if (char == '8') {
                                if (activeLongNote === null) {
                                    this._throwError(lineNo, line, `long note not started`);
                                }
                                activeLongNote.endTime = chartState.curTime;
                                activeLongNote.length = activeLongNote.endTime - activeLongNote.hitTime;
                                notes.push(activeLongNote);

                                activeLongNote = null;
                            }
                           
                            chartState.curTime += lengthPerNote;
                        } else if (char === ',') { // increment bar
                            
                            if (bars[chartState.curBar].num_notes == 0) {
                                chartState.curTime += lengthOfBar;
                            }

                            if (chartState.showBarline) {
                                barlines.push({
                                    id: chartState.curBar,
                                    time: chartState.curTime,
                                    speed: speed,
                                });
                            }
                            chartState.curBar++;
                        }
                    }
                }
            }
        }

        return {
            endLineNo: endLineNo,
            chart: {
                barlines: barlines,
                notes: notes,
            }
        };
            
    }
}