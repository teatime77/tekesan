namespace tekesan {
declare let MathJax:any;
export const padding = 10;
const endMark = "⛩";
let stopPlaying: boolean = false;

export function msg(text: string){
    console.log(text);

    if(ui.msg != undefined){

        ui.msg.textContent = ui.msg.textContent + "\n" + text;
        ui.msg.scrollTop = ui.msg.scrollHeight;
    }
}

export function range(n: number) : number[]{
    return [...Array(n).keys()];
}

export function last<T>(v:Array<T>) : T{
    console.assert(v.length != 0);

    return v[v.length - 1];
}


function getIndent(line: string) : [number, string]{
    let indent = 0;
    while(true){
        if(line.startsWith("\t")){
            indent++;
            line = line.substring(1);    
        }
        else if(line.startsWith("    ")){
            indent++;
            line = line.substring(4);
        }
        else{
            return [indent, line];
        }
    }
}

function tab(indent: number){
    return " ".repeat(4 * indent);
}

export function makeHtmlLines(text: string){
    const lines = text.split('\n');
    const htmlLines = [];            

    let inMath = false;
    let ulIndent = -1;
    let prevLine = "";
    for(let currentLine of lines){
        let currentLineTrim = currentLine.trim();

        let [indent, line] = getIndent(currentLine);
        indent--;

        if(currentLineTrim == "$$"){
            inMath = ! inMath;
            htmlLines.push(currentLine);
        }
        else{
            if(inMath){

                htmlLines.push(currentLine);
            }
            else{

                if(line.startsWith("# ")){
                    htmlLines.push(tab(indent + 1) + "<strong><span>" + line.substring(2) + "</span></strong><br/>")
                }
                else if(line.startsWith("- ")){
                    if(ulIndent < indent){
                        console.assert(ulIndent + 1 == indent);
                        htmlLines.push(tab(indent) + "<ul>")
                        ulIndent++;
                    }
                    else{
                        while(ulIndent > indent){
                            htmlLines.push(tab(ulIndent) + "</ul>")
                            ulIndent--;
                        }                            
                    }
                    htmlLines.push(tab(indent + 1) + "<li><span>" + line.substring(2) + "</span></li>")
                }
                else{

                    if(prevLine.endsWith("</li>")){
                        htmlLines[htmlLines.length - 1] = prevLine.substring(0, prevLine.length - 5) + "<br/>";
                        htmlLines.push(tab(indent + 1) + "<span>" + line + "</span></li>")
                    }
                    else{

                        htmlLines.push(tab(indent + 1) + "<span>" + line + "</span><br/>")
                    }
                }
            }
        }

        prevLine = htmlLines[htmlLines.length - 1];
    }

    while(ulIndent != -1){
        htmlLines.push(tab(ulIndent) + "</ul>")
        ulIndent--;
    }

    return htmlLines.join("\n");
}

export function tostr(text: string){
    if(! text.includes('\n')){
        return JSON.stringify(text);
    }
    else{
        return `${endMark}${text}${endMark}`;
    }
}

export function serializeDoc(title: string) : string {
    return `{
  "title": "${title}",
  "actions": [
${actions.filter(x => !(x instanceof EmptyAction)) .map(x => "    " + x.toStr()).join(",\n")}
  ]
}`
}

export function deserializeDoc(text: string, oncomplete:()=>void){
    actions = [];

    ui.board.innerHTML = "";

    const doc = JSON.parse(reviseJson(text));

    const h1 = document.createElement("h1");
    h1.innerHTML = doc.title;
    ui.board.appendChild(h1);

    suppressMathJax = true;
    for(let [id, obj] of doc.actions.entries()){
        let act: Action;

        switch(obj.type){
        case "text":
            act = new TextBlockAction((obj as TextBlockAction).text);
            break;
        
        case "speech":
            act = new SpeechAction((obj as SpeechAction).text);
            break;

        case "select":
            let sel = obj as SelectionAction;
            act = new SelectionAction(sel.refId, sel.domType, sel.startPath, sel.endPath, sel.color);
            break;

        case "disable":
            act = new DisableAction((obj as DisableAction).refId);
            break;

        default:
            console.assert(false);
            break;
        }
        console.assert(act.id == id);

        actions.push(act);

        ui.timeline.max = `${actions.length - 1}`;
        ui.timeline.valueAsNumber = actions.length - 1;
    }
    suppressMathJax = false;

    if(ui.summary != undefined){

        ui.summary.textContent = last(actions).summary();
    }

    MathJax.Hub.Queue(["Typeset",MathJax.Hub]);
    MathJax.Hub.Queue([function(){
        ui.timeline.max = `${actions.length - 1}`;
        updateTimePos(actions.length - 1);
        updateTimePos(-1);

        if(oncomplete != undefined){
            oncomplete();
        }
    }]);
}

export function reviseJson(text:string){
    let ret = "";

    const el = endMark.length;
    while(true){
        let k1 = text.indexOf(endMark);
        if(k1 == -1){
            return ret + text;
        }

        let k2 = text.indexOf(endMark, k1 + el);
        console.assert(k2 != -1);

        ret += text.substring(0, k1) + JSON.stringify(text.substring(k1 + el, k2));
        text = text.substring(k2 + el);
    }
}

function renumId(){
    for(let [id, act] of actions.entries()){
        if(act instanceof TextBlockAction){
            act.div.id = getBlockId(id);
        }
        else if(act instanceof SelectionAction){
            const block = actions.find(x => x.id == (act as SelectionAction).refId);
            console.assert(block != undefined);

            act.refId = actions.indexOf(block);
            console.assert(act.refId != -1);
        }
        else if(act instanceof DisableAction){

            act.refId = actions.indexOf(act.disableAct);
            console.assert(act.refId != -1);
        }
    }

    for(let [id, act] of actions.entries()){
        act.id = id;
    }
}

export function backup(path: string, title: string){
    renumId();
    const text = serializeDoc(title);
    msg(`[${text}]`);

    navigator.clipboard.writeText(text).then(function() {
        msg("copy OK");
    }, function() {
        msg("copy NG");
    });

    var url = `${window.location.origin}/`;
    var data = {
        "path": path,
        "text": text,
    };
    
    fetch(url, {
        method: "POST", // or 'PUT'
        body: JSON.stringify(data),
        headers:{
            'Content-Type': 'application/json'
        }
    })
    .then(res => res.json())
    .then(response => {
        console.log('Success:', JSON.stringify(response))
    })
    .catch(error => {
        console.error('Error:', error)
    });
}

export function fetchText(path:string, fnc:(text: string)=>void){
    let url: string;

    if(path.startsWith("http")){

        url = path;
    }
    else{

        let k = window.location.href.lastIndexOf("/");

        url = `${window.location.href.substring(0, k)}/${path}`;
    }
    const url2 = encodeURI(url);
    msg(`fetch-json:${url} ${url2}`);
    fetch(url2)
    .then((res: Response) => {
        return res.text();
    })
    .then(text => {
        fnc(text);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

export function openDoc(path: string, oncomplete:()=>void){
    fetchText(`json/${path}.json`, (text: string)=>{
        deserializeDoc(text, oncomplete);
    });
}

export function runGenerator(gen: IterableIterator<any>){
    stopPlaying = false;

    const id = setInterval(function(){
        const ret = gen.next();
        if(ret.done || stopPlaying){        

            clearInterval(id);
            msg("停止しました。");
        }
    },10);
}


}
