namespace bansho {

declare let Viz : any;

let viz : any;

let sim: Simulation;

let srcVar : Variable | null = null;

let simEditDlg            : HTMLDialogElement;
let simParamsInp          : HTMLInputElement;

let texEditDlg            : HTMLDialogElement;
let texShapeInp           : HTMLInputElement;
let texShapeValue         : HTMLElement;
let currentTex            : Variable;
let texTexelTypeSel       : HTMLSelectElement;

let pkgEditDlg            : HTMLDialogElement;
let pkgParamsInp          : HTMLInputElement;
let pkgNumInputFormulaInp : HTMLInputElement;
let pkgFragmentShaderSel  : HTMLSelectElement;
export let pkgVertexShaderDiv: HTMLDivElement;

let currentPkg            : PackageInfo;

export function addTokenNode(div: HTMLDivElement, token: Token){
    if(token.typeTkn == TokenType.space){

        let span = document.createElement("span");
        span.innerHTML = "&nbsp;".repeat(token.text.length);
        div.appendChild(span);
    }
    else{

        let span = document.createElement("span");
        switch(token.typeTkn){
        case TokenType.reservedWord: span.style.color = "blue"; break;
        case TokenType.type        : span.style.color = "green"; break;
        case TokenType.Number      : span.style.color = "red"; break;
        }
        span.textContent = token.text;
        div.appendChild(span);
    }
}

function setCode(text: string){
    pkgVertexShaderDiv.innerHTML= "";

    for(let line of text.split('\n')){
        let div = document.createElement("div");
        pkgVertexShaderDiv.appendChild(div);

        let tokens = Lex(line);
        if(tokens.length == 0){
            // div.appendChild(document.createElement("br"));
            div.innerHTML = "<span><br></span>";
            continue;
        }

        for(let token of tokens){
            if(token.typeTkn == TokenType.newLine){
            
                throw new Error();
            }
            else{

                addTokenNode(div, token);
            }
        }
    }
}

export class Variable {
    id!              : string;
    package!         : PackageInfo;
    modifier!        : string;
    type!            : string;
    texelType       : string | null = null;
    name!            : string;
    dstVars         : Variable[] = [];
    shapeFormula    : string = "";

    constructor(obj: any){
        Object.assign(this, obj);
    }

    makeObj() : any {
        let obj = Object.assign({}, this) as any;
        obj.typeName = Variable.name;
        obj.dstVars = this.dstVars.map(x => `${x.id}`);
        delete obj.package;

        return obj;
    }

    click(ev: MouseEvent){
        if(ev.ctrlKey){
            if(srcVar == null){
                srcVar = this;
            }
            else{
                srcVar.dstVars.push(this);
                if((this.type == "sampler2D" || this.type == "sampler3D") && this.texelType == null){
                    this.texelType = srcVar.type;
                    if(this.shapeFormula == ""){

                        this.shapeFormula = srcVar.package.numInputFormula;
                    }
                }

                srcVar = null;
                makeGraph();
            }
        }
        else{
            if(this.type == "sampler2D" || this.type == "sampler3D"){
                showTextureEditDlg(this);
            }
        }
    }
}

export class PackageInfo {
    id!              : string;
    params           : string = "";
    numInputFormula  : string = "";
    numGroup         : string | undefined = undefined;
    mode             : string = "";
    vertexShader!    : string;
    fragmentShader   : string = gpgputs.GPGPU.minFragmentShader;

    static cnt = 0;
    static newObj() : PackageInfo {
        return {
            typeName        : PackageInfo.name,
            id              : `pkg_${PackageInfo.cnt++}`,
            params          : "",
            numInputFormula : "",
            numGroup        : undefined,
            mode            : "",
            vertexShader    : "",
            fragmentShader  : "",
        } as unknown as PackageInfo;
    }
}

export class Simulation extends Widget {
    view!        : View;
    params       : string = "";
    packageInfos : PackageInfo[] = [];
    varsAll      : Variable[] = [];

    constructor(){
        super();
    }

    make(obj: any) : Widget {
        super.make(obj);

        let prevView = glb.widgets.slice().reverse().find(x => x instanceof View) as View;
        if(prevView == undefined){
            throw new Error();
        }

        this.view = prevView;
        if(this.view.gpgpu == null){
            this.view.gpgpu = make3D(this.view.canvas);
        }
        gl = gpgputs.gl;

        let va_map : { [id:string] : Variable} = {};

        this.varsAll.forEach(x => va_map[x.id] = x);

        for(let va of this.varsAll){
            let pkg = this.packageInfos.find(x => va.id.startsWith(x.id + "_"));
            if(pkg == undefined){
                throw new Error();
            }
            va.package = pkg;

            va.dstVars = (va.dstVars as unknown as string[]).map(id => va_map[id]);
        }

        return this;
    }

    makeObj() : any {        
        return Object.assign(super.makeObj(), {
            params       : this.params,
            packageInfos : this.packageInfos,
            varsAll      : this.varsAll.map(x => x.makeObj())
        });
    }

    summary() : string {
        return "シミュレーション";
    }
    
    enable(){
        sim = this;
        this.applyGraph();
    }

    disable(){
        this.view.gpgpu!.clearAll();
    }

    applyGraph(){
        this.view.gpgpu!.clearAll();
        // this.view.gpgpu = make3D(this.view.canvas);

        let packages: gpgputs.Package[] = [];

        for(let pkgInfo of this.packageInfos){
            let pkg = new gpgputs.Package(pkgInfo);
            pkg.mode = gpgputs.getDrawMode(pkgInfo.mode);
            pkg.args = {};
            pkg.numInput = calcPkgNumInput(pkgInfo.params, pkgInfo.numInputFormula);
            if(isNaN(pkg.numInput)){
                throw new Error();
            }
            if(pkgInfo.numGroup != undefined){
                pkg.numGroup = calcPkgNumInput(pkgInfo.params, pkgInfo.numGroup);
                if(isNaN(pkg.numGroup)){
                    throw new Error();
                }
            }

            packages.push(pkg);


            if(pkgInfo.vertexShader.includes("@{")){
                let map = getParamsMap([ sim.params, pkgInfo.params ]);
                if(map == null){
                    throw new Error();
                }

                let shader = pkgInfo.vertexShader;
                for(let [name, val] of Object.entries(map)){
                    let key = `@{${name}}`;
                    while(shader.includes(key)){
                        shader = shader.replace(key, `${val}`);
                    }
                }

                pkg.vertexShader = shader;
            }

            let vars = this.varsAll.filter(x => x.id.startsWith(`${pkg.id}_`));
            for(let va1 of vars){
                if(pkg.args[va1.name] == undefined){
                    if(va1.type == "sampler2D" || va1.type == "sampler3D"){

                        let shape = calcTexShape(pkgInfo, va1.shapeFormula);
                        if(va1.texelType == null || shape == null){
                            throw new Error();
                        }
                        if(pkg.vertexShader.includes("@factorize@")){
                            console.assert(shape.length == 2 && shape[0] == 1);
                            shape = Factorize(shape[1]);
                        }

                        pkg.args[va1.name] = new gpgputs.TextureInfo(va1.texelType, shape);
                    }
                    else{
                        pkg.args[va1.name] = new Float32Array( pkg.numInput * gpgputs.vecDim(va1.type) );
                    }
                }
            }

            this.view.gpgpu!.makePackage(pkg);
        }

        for(let pkg of packages){
            let vars = this.varsAll.filter(x => x.id.startsWith(`${pkg.id}_`));
            for(let src of vars){

                for(let dst of src.dstVars){
                    let dstPkg = packages.find(x => x.id == dst.package.id);
                    if(dstPkg == undefined){
                        throw new Error();
                    }
                    pkg.bind(src.name, dst.name, dstPkg);
                }
            }

            pkg.args["tick"] = undefined;
        }

        this.view.gpgpu!.drawables.push(... packages);
    }
}


function getIOVariables(pkg: PackageInfo){
    let vars: Variable[] = [];

    let tokens = Lex(pkg.vertexShader, true);
    tokens = tokens.filter(x => x.typeTkn != TokenType.space);

    for(let [i, token] of tokens.entries()){
        if(["uniform", "in", "out"].includes(token.text)){
            if(["uPMVMatrix", "uNMatrix", "tick", "fragmentColor", "gl_Position", "vLightWeighting"].includes(tokens[i + 2].text)){
                continue;
            }

            let name = tokens[i + 2].text;
            let iovar = new Variable({
                id       : `${pkg.id}_${name}`,
                package  : pkg,
                modifier : token.text,
                type     : tokens[i + 1].text,
                name     : name
            });
            vars.push(iovar);
        }
    }

    return vars;
}

function getParamsMap(formulas: string[]){
    let map: { [name: string]: number } = {};

    for(let formula of formulas){
        if(formula.trim() == ""){
            continue;
        }
        let items = formula.split(',');
        for(let item of items){
            let v = item.split('=');
            if(v.length != 2){
                return null;
            }

            let [name, value] = v;
            let n = parseMath(map, value);
            if(isNaN(n)){
                
                return null;
            }
    
            map[name.trim()] = n;
        }    
    }

    return map;
}

function calcTexShape(pkg: PackageInfo, shapeFormula: string){
    let map = getParamsMap([ sim.params, pkg.params ]);
    if(map == null){
        return null;
    }

    let shape  = shapeFormula.split(',').map(x => parseMath(map!, x.trim()));
    if(shape.length < 1 || 3 < shape.length || shape.some(x => isNaN(x))){
        return null;
    }

    if(shape.length == 1){
        shape = [1, shape[0]];
    }

    return shape
}

function calcPkgNumInput(pkgParams: string, numInputFormula: string){
    let map = getParamsMap([ sim.params, pkgParams ]);
    if(map == null){
        return NaN;
    }

    return parseMath(map, numInputFormula);
}

function showTextureEditDlg(tex: Variable){
    currentTex = tex;

    getElement("tex-name").innerText = tex.name;
    if(tex.texelType == null){
        texTexelTypeSel.selectedIndex = -1;
    }
    else{
        texTexelTypeSel.value = tex.texelType;
    }

    texShapeInp.value = tex.shapeFormula;
    texShapeValue.innerText = "";

    texEditDlg.showModal();
}

//-------------------------------------------------- パッケージ編集画面

function showPackageEditDlg(pkg: PackageInfo){
    currentPkg = pkg;

    pkgParamsInp.value   = pkg.params;

    pkgNumInputFormulaInp.value = pkg.numInputFormula;

    if(pkg.fragmentShader == gpgputs.GPGPU.minFragmentShader){
        pkgFragmentShaderSel.value = "none";
    }
    else if(pkg.fragmentShader == gpgputs.GPGPU.pointFragmentShader){
        pkgFragmentShaderSel.value = "point";
    }
    else if(pkg.fragmentShader == gpgputs.GPGPU.planeFragmentShader){
        pkgFragmentShaderSel.value = "plane";
    }

    setCode(pkg.vertexShader);
    pkgEditDlg.showModal();
    console.log(`pkg.id click`);    
}

function makeGraph(){
    let texts : string[] = [];

    let varsAll_old = sim.varsAll;
    sim.varsAll = [];    
    for(let pkg of sim.packageInfos){
        let vars = getIOVariables(pkg);
        sim.varsAll.push(...vars);

        let lines : string[] = [];
        let invars = vars.filter(v=> v.modifier == "uniform" || v.modifier == "in");
        for(let x of invars){
            lines.push(`${x.id} [ id="${x.id}", label = "${x.name}", shape = box];`);
            lines.push(`${x.id} -> ${pkg.id}_vertex`);
        }

        let outvars = vars.filter(v=> v.modifier == "out");
        for(let x of outvars){
            lines.push(`${x.id} [ id="${x.id}", label = "${x.name}", shape = box];`);
            lines.push(`${pkg.id}_vertex -> ${x.id}`);
        }
        
        texts.push(... `subgraph cluster_${pkg.id} {
            label = "${pkg.id}";
        
            ${pkg.id}_vertex [ id="${pkg.id}_vertex", label = "シェーダー", shape = box];

            ${lines.join('\n')}
        };
        `.split('\n'))
    }

    for(let src_old of varsAll_old){
        let src_new = sim.varsAll.find(x => x.id == src_old.id);
        if(src_new != undefined){
            src_new.texelType    = src_old.texelType;
            src_new.shapeFormula = src_old.shapeFormula;

            for(let dst_old of src_old.dstVars){
                let dst_new = sim.varsAll.find(x => x.id == dst_old.id);
                if(dst_new != undefined){
                    src_new.dstVars.push(dst_new);
                    texts.push(`${src_new.id} -> ${dst_new.id} `);
                }
            }
        }
    }
    // let box = packages.map(x => `${x.id} [ label="パッケージ", id="${x.id}" ];`).join('\n    ');

    let dot = `
    digraph graph_name {
        graph [ charset = "UTF-8" ];
        ${texts.join("\n")}
    }
    `;
    
    // dot = 'digraph { a -> b }';
    viz.renderSVGElement(dot)
    .then(function(element: any) {
        let div = getElement("sim-edit-div");
        if(div.firstChild != null){
            div.firstChild.remove();
        }

        div.appendChild(element);

        setGraphEvent();
    })
    .catch((error: any) => {
        // Create a new Viz instance (@see Caveats page for more info)
        viz = new Viz();

        // Possibly display the error
        console.error(error);
    });
}

export function initBinder(){
    simEditDlg            = getElement("sim-edit-dlg") as HTMLDialogElement;
    simParamsInp          = getElement("sim-params") as HTMLInputElement;

    pkgEditDlg            = getElement("pkg-edit-dlg") as HTMLDialogElement;
    pkgParamsInp          = getElement("pkg-params") as HTMLInputElement;
    pkgNumInputFormulaInp = getElement("pkg-numInput") as HTMLInputElement;
    pkgFragmentShaderSel  = getElement("pkg-fragment-shader") as HTMLSelectElement;
    pkgVertexShaderDiv    = getElement("pkg-vertex-shader") as HTMLDivElement;
    
    //-------------------------------------------------- テクスチャ編集画面
    texEditDlg      = getElement("tex-edit-dlg") as HTMLDialogElement;
    texShapeInp     = getElement("tex-shape") as HTMLInputElement;
    texShapeValue   = getElement("tex-shape-value");
    texTexelTypeSel = getElement("tex-texel-type") as HTMLSelectElement;

    viz = new Viz();

    //-------------------------------------------------- 3D編集画面

    setBinderEvent();
    initCodeEditor();
}

function setBinderEvent(){
    getElement("open-package").addEventListener("click", (ev: MouseEvent)=>{

        sim = new Simulation();
        sim.make({});
        glb.addWidget(sim);
        simEditDlg.showModal();
    });
    
    //-------------------------------------------------- シミュレーション編集画面

    simParamsInp.addEventListener("blur", function(ev: FocusEvent){
        let map = getParamsMap([ simParamsInp.value ]);
        simParamsInp.style.color = map == null ? "red" : "black";
        if(map != null){
            sim.params = simParamsInp.value.trim();
        }
    });

    getElement("add-shape-pkg").addEventListener("click", (ev: MouseEvent)=>{
        let sel = getElement("sel-shape-pkg") as HTMLSelectElement;

        if(sel.value == "sphere"){
            sim.packageInfos.push( Object.assign(PackageInfo.newObj(), SpherePkg) );
        }
        else if(sel.value == "cube"){
            sim.packageInfos.push( Object.assign(PackageInfo.newObj(), CubePkg()) );
        }
        else if(sel.value == "Arrow1D"){
            sim.packageInfos.push( Object.assign(PackageInfo.newObj(), Arrow1DPkg) );
        }
        else if(sel.value == "Arrow3D"){
            sim.packageInfos.push( Object.assign(PackageInfo.newObj(), ArrowFanPkg()) );
            sim.packageInfos.push( Object.assign(PackageInfo.newObj(), ArrowTubePkg()) );
        }
        else{
            return;
        }

        makeGraph();
    });

    getElement("add-package").addEventListener("click", (ev: MouseEvent)=>{
        let pkg = Object.assign(
            PackageInfo.newObj(),
            {
                mode            : gpgputs.getDrawModeText(gl.POINTS),
                vertexShader    : EMWave,
                fragmentShader  : gpgputs.GPGPU.minFragmentShader,
            }
        );
        
        sim.packageInfos.push(pkg);

        makeGraph();
    });
    
    getElement("sim-edit-ok").addEventListener("click", (ev: MouseEvent)=>{
        simEditDlg.close();
        let obj = sim.makeObj();
        console.log(`${JSON.stringify(obj, null, 4)}`);
        sim.enable();
    })

    getElement("sim-edit-cancel").addEventListener("click", (ev: MouseEvent)=>{
        sim.view.gpgpu!.clearAll();
        simEditDlg.close();
    })

    //-------------------------------------------------- パッケージ編集画面

    pkgParamsInp.addEventListener("blur", function(ev: FocusEvent){
        let map = getParamsMap([ simParamsInp.value, pkgParamsInp.value]);
        pkgParamsInp.style.color = map == null ? "red" : "black";
    });

    pkgNumInputFormulaInp.addEventListener("blur", function(ev: FocusEvent){
        let val = NaN;

        let map = getParamsMap([ simParamsInp.value, pkgParamsInp.value ]);
        if(map != null){

            val  = parseMath(map, this.value.trim());
        }

        pkgNumInputFormulaInp.style.color = isNaN(val) ? "red" : "black";

        getElement("pkg-numInput-value").innerText = `${val}`;
    });

    getElement("pkg-edit-cancel").addEventListener("click", (ev: MouseEvent)=>{
        pkgEditDlg.close();
    });

    getElement("pkg-edit-ok").addEventListener("click", (ev: MouseEvent)=>{
        let numInputFormula = pkgNumInputFormulaInp.value.trim();


        let val  = calcPkgNumInput(pkgParamsInp.value, numInputFormula);
        if(! isNaN(val)){

            currentPkg.params          = pkgParamsInp.value;
            currentPkg.numInputFormula = numInputFormula;

            let text = pkgVertexShaderDiv.innerText;
            text = text.replace(/\n\n/g, '\n');
            while(text.includes('\xA0')){
                text = text.replace('\xA0', ' ');
            }

            currentPkg.vertexShader    = text;

            pkgEditDlg.close();

            makeGraph();
        }
    });

    //-------------------------------------------------- テクスチャ編集画面

    texShapeInp.addEventListener("blur", function(ev: FocusEvent){
        let items = this.value.split(',');

        let map = getParamsMap([ simParamsInp.value, currentTex.package.params ]);
        if(map != null){

            let vals  = items.map(x => parseMath(map!, x.trim()));
            let text  = vals.map(x => `${x}`).join(", ");
    
            texShapeValue.innerText = text;
        }
        else{
            texShapeValue.innerText = "";
        }
    });

    getElement("tex-edit-cancel").addEventListener("click", (ev: MouseEvent)=>{
        texEditDlg.close();
    })

    getElement("tex-edit-ok").addEventListener("click", (ev: MouseEvent)=>{
        let shape = calcTexShape(currentTex.package, texShapeInp.value);
        if(shape == null){
            return;
        }

        currentTex.shapeFormula = texShapeInp.value.trim();
        currentTex.texelType = texTexelTypeSel.value;

        texEditDlg.close();        
    })
}

function setGraphEvent(){
    for(let pkg of sim.packageInfos){

        let dom = getElement(`${pkg.id}_vertex`);
        dom.addEventListener("click", function(ev: MouseEvent){

            let pkg1 = sim.packageInfos.find(x => this.id == `${x.id}_vertex`);
            if(pkg1 == undefined) throw new Error();

            showPackageEditDlg(pkg1);
        });
    }

    for(let va of sim.varsAll){
        let dom = getElement(`${va.package.id}_${va.name}`);
        dom.addEventListener("click", function(ev: MouseEvent){

            let va1 = sim.varsAll.find(x => this.id == `${x.package.id}_${x.name}`);
            if(va1 == undefined) throw new Error();
            va1.click(ev);
        });
    }
}

export function openSimulationDlg(act: Simulation){
    sim = act;
    simParamsInp.value = sim.params;
    sim.disable();
    simEditDlg.showModal();
}

export function Factorize(cnt: number){
    let i1 = 1, i2 = cnt;

    for(let d of [ 5, 3, 2 ]){
        while(i2 % d == 0){
            i2 /= d;
            i1 *= d;

            if(Math.sqrt(cnt) <= i1){
                return [ i1, i2 ];
            }
        }
    }
    return [ i1, i2 ];
}

//--------------------------------------------------
// 粒子
//--------------------------------------------------

export let SpherePkg = {
    params          : "n1 = 8, n2 = 8, radius = 0.04",
    numInputFormula : "cnt * n1 * n2 * 6",
    mode            : "TRIANGLES",
    fragmentShader  : gpgputs.GPGPU.planeFragmentShader,
    vertexShader    : `

const vec3 uAmbientColor = vec3(0.2, 0.2, 0.2);
const vec3 uLightingDirection =  normalize( vec3(0.25, 0.25, 1) );
const vec3 uDirectionalColor = vec3(0.8, 0.8, 0.8);

uniform mat4 uPMVMatrix;
uniform mat3 uNMatrix;

out vec3 vLightWeighting;
out vec4 fragmentColor;

#define PI 3.14159265359

uniform sampler2D inPos;

void main(void) {
    int idx = int(gl_VertexID);

    int ip  = idx % 6;
    idx    /= 6;

    int it = idx % @{n1};
    idx    /= @{n1};


    int iz = idx % @{n2};
    idx    /= @{n2};

    // 1,4  5
    // 0    2,3


    if(ip == 1 || ip == 4 || ip == 5){
        iz++;
    }
    if(ip == 2 || ip == 3 || ip == 5){
        it++;
    }

    float z = sin(-PI/2.0 + PI * float(iz) / @{n1}.0);
    float r = sqrt(1.0 - z * z);
    float x = r * cos(2.0 * PI * float(it) / @{n2}.0);
    float y = r * sin(2.0 * PI * float(it) / @{n2}.0);

    float nx = x, ny = y, nz = z;

    fragmentColor = vec4(0.5, 0.5, 0.5, 5.0);

    vec3 pos = vec3(texelFetch(inPos, ivec2(idx, 0), 0));
    vec3 pos2 = pos + float(@{radius}) * vec3(x, y, z);

    gl_Position = uPMVMatrix * vec4(pos2, 1.0);

    vec3 transformedNormal = uNMatrix * vec3(nx, ny, nz);

    float directionalLightWeighting = max(dot(transformedNormal, uLightingDirection), 0.0);
    vLightWeighting = uAmbientColor + uDirectionalColor * directionalLightWeighting;
}`

} as unknown as PackageInfo;


function CubePkg(){
    return {
    params          : "",
    numInputFormula : "6 * 6",
    mode            : "TRIANGLES",
    fragmentShader  : gpgputs.GPGPU.planeFragmentShader,
    vertexShader    : `

${headShader}

void main(void) {
    int idx = int(gl_VertexID);

    int ip   = idx % 6;
    int face = idx / 6;

    // 1,4  5
    // 0    2,3

    float f[3];
    f[0] = (ip == 1 || ip == 4 || ip == 5 ? 1.0 : -1.0);
    f[1] = (ip == 2 || ip == 3 || ip == 5 ? 1.0 : -1.0);
    f[2] = (face % 2 == 0 ? -1.0 : 1.0);

    int i = face / 2;
    float x = f[i];
    float y = f[(i+1) % 3];
    float z = f[(i+2) % 3];

    float nx = 0.0, ny = 0.0, nz = 0.0;
    if(i == 0){
        nz = z;
    }
    else if(i == 1){
        ny = y;
    }
    else{
        nx = x;
    }

    fragmentColor = vec4(abs(ny), abs(nz), abs(nx), 0.3);

    ${tailShader}
}`

    } as unknown as PackageInfo;
}

export let Arrow1DPkg = {
    params          : "r = 1.0, g = 0.0, b = 0.0",
    numInputFormula : "cnt * 2",
    mode            : "LINES",
    fragmentShader  : gpgputs.GPGPU.pointFragmentShader,
    vertexShader    : `

uniform sampler2D inPos;
uniform sampler2D inVec;

uniform mat4 uPMVMatrix;

out vec4 fragmentColor;

void main(void) {
    int sx  = textureSize(inPos, 0).x;

    int idx = int(gl_VertexID);

    int ip  = idx % 2;
    idx    /= 2;

    // @factorize@
    int col  = idx % sx;
    int row  = idx / sx;

    vec3 pos = vec3(texelFetch(inPos, ivec2(col, row), 0));

    if(ip == 1){

        vec3 vec = vec3(texelFetch(inVec, ivec2(col, row), 0));
        pos += vec;
    }

    fragmentColor = vec4(float(@{r}), float(@{g}), float(@{b}), 1.0);

    gl_PointSize  = 5.0;
    gl_Position = uPMVMatrix * vec4(pos, 1.0);
}`
};


function ArrowFanPkg(){
    return {
    params          : "npt = 9, r = 0.5, g = 0.5, b = 0.5",
    numInputFormula : "cnt * 3 * npt",
    numGroup        : "npt",
    mode            : "TRIANGLE_FAN",
    fragmentShader  : gpgputs.GPGPU.planeFragmentShader,
    vertexShader    : `

${bansho.headShader}

uniform int   tick;

uniform sampler2D inPos;
uniform sampler2D inVec;

void main(void) {
    int idx = int(gl_VertexID);

    int ip  = idx % @{npt};
    idx /= @{npt};

    int mod = idx % 3;
    idx /= 3;

    vec3 pos = vec3(texelFetch(inPos, ivec2(idx, 0), 0));
    vec3 vec = vec3(texelFetch(inVec, ivec2(idx, 0), 0));

    // 円錐の底面の円の中心
    vec3 p1 = pos + 0.8 * vec;;

    // 円錐の頂点
    vec3 p2 = pos + vec;

    float x, y, z;
    vec3 nv;

    if(ip == 0){
        // 円錐の頂点や円の中心の場合
        
        if(mod == 0){
            // 円錐の頂点の場合

            x = p2.x;
            y = p2.y;
            z = p2.z;

            nv = normalize(p2 - p1);
        }
        else if(mod == 1){
            // 円錐の底面の円の中心の場合

            x = p1.x;
            y = p1.y;
            z = p1.z;

            nv = normalize(p1 - p2);
        }
        else{
            // 矢印の始点の円の中心の場合

            x = pos.x;
            y = pos.y;
            z = pos.z;

            nv = normalize(pos - p1);
        }
    }
    else{
        // 円錐の底面や矢印の始点の円周の場合

        vec3 e1 = normalize(vec3(p1.y - p1.z, p1.z - p1.x, p1.x - p1.y));

        vec3 e2 = normalize(cross(p1, e1));

        float theta = 2.0 * PI * float(ip - 1) / float(@{npt} - 2);

        // 円の中心
        vec3 cc;

        // 円の半径
        float r;
        
        if(mod != 2){

            cc = p1;
            r = 0.05;
        }
        else{
            // 矢印の始点の円周の場合

            cc = pos;
            r = 0.02;
        }

        // 円周上の点
        vec3 p3 = cc + r * cos(theta) * e1 + r * sin(theta) * e2;

        if(mod == 0){
            // 円錐の場合

            // 円の接線方向
            vec3 e3 = sin(theta) * e1 - cos(theta) * e2;

            nv = normalize(cross(p2 - p3, e3));
        }
        else{
            // 円の場合

            nv = normalize(- vec);
        }

        x = p3.x;
        y = p3.y;
        z = p3.z;
    }

    float nx = nv.x, ny = nv.y, nz = nv.z;

    // fragmentColor = vec4(abs(ny), abs(nz), abs(nx), 1.0);
    fragmentColor = vec4(@{r}, @{g}, @{b}, 1.0);

    ${bansho.tailShader}
}`

    } as unknown as PackageInfo;
}


function ArrowTubePkg(){
    return {
    params          : "npt = 9, r = 0.5, g = 0.5, b = 0.5",
    numInputFormula : "cnt * 2 * npt",
    numGroup        : "2 * npt",
    mode            : "TRIANGLE_STRIP",
    fragmentShader  : gpgputs.GPGPU.planeFragmentShader,
    vertexShader    : `

    ${bansho.headShader}
    
    uniform int   tick;
    
    uniform sampler2D inPos;
    uniform sampler2D inVec;
    
    void main(void) {
        int idx = int(gl_VertexID);
    
        int lh  = idx % 2;
        idx /= 2;
    
        int ip  = idx % @{npt};
        idx /= @{npt};
    
        vec3 pos = vec3(texelFetch(inPos, ivec2(idx, 0), 0));
        vec3 vec = vec3(texelFetch(inVec, ivec2(idx, 0), 0));
    
        vec3 e1 = normalize(vec3(vec.y - vec.z, vec.z - vec.x, vec.x - vec.y));
    
        vec3 e2 = normalize(cross(vec, e1));
    
        // 円の中心
        vec3 cc;
    
        if(lh == 0){
            cc = pos;
        }
        else{
    
            cc = pos + 0.8 * vec;
        }
    
        // 円の半径
        float r = 0.02;
    
        float theta = 2.0 * PI * float(ip - 1) / float(@{npt} - 2);
    
        // 円周上の点
        vec3 p3 = cc + r * cos(theta) * e1 + r * sin(theta) * e2;
        
        // 法線ベクトル
        vec3 nv = normalize(p3 - cc);
    
        float x = p3.x;
        float y = p3.y;
        float z = p3.z;
    
        float nx = nv.x, ny = nv.y, nz = nv.z;
    
        // fragmentColor = vec4(abs(ny), abs(nz), abs(nx), 1.0);
        fragmentColor = vec4(@{r}, @{g}, @{b}, 1.0);
    
        ${bansho.tailShader}
    }`

    } as unknown as PackageInfo;
}

let EMWave = `

precision highp sampler3D;

uniform int   tick;
    
uniform sampler3D inE;
uniform sampler3D inH;
out vec3 outPos;
out vec3 outE;
out vec3 outH;

#define PI 3.14159265359

#define mu0      1.25663706212e-06
#define epsilon0 8.854187812799999e-12
#define c0       299792458

vec3 calcRot(int flag, vec3 E, vec3 H, int i, int j, int k){
    if(flag == 1){
        vec3 Ei = E;
        vec3 Ej = E;
        vec3 Ek = E;

        if(i + 1 < @{sx}){

            Ei = vec3(texelFetch(inE, ivec3(i + 1, j    , k    ), 0));
        }

        if(j + 1 < @{sy}){

            Ej = vec3(texelFetch(inE, ivec3(i    , j + 1, k    ), 0));
        }

        if(k + 1 < @{sz}){

            Ek = vec3(texelFetch(inE, ivec3(i    , j    , k + 1), 0));
        }

        float rx = (Ej.z - E.z) - (Ek.y - E.y);
        float ry = (Ek.x - E.x) - (Ei.z - E.z);
        float rz = (Ei.y - E.y) - (Ej.x - E.x);

        return vec3(rx, ry, rz);
    }
    else{

        vec3 Hi = H; 
        vec3 Hj = H; 
        vec3 Hk = H; 

        if(0 <= i - 1){

            Hi = vec3(texelFetch(inH, ivec3(i - 1, j    , k    ), 0));
        }

        if(0 <= j - 1){

            Hj = vec3(texelFetch(inH, ivec3(i    , j - 1, k    ), 0));
        }

        if(0 <= k - 1){

            Hk = vec3(texelFetch(inH, ivec3(i    , j    , k - 1), 0));
        }

        float rx = (H.z - Hj.z) - (H.y - Hk.y);
        float ry = (H.x - Hk.x) - (H.z - Hi.z);
        float rz = (H.y - Hi.y) - (H.x - Hj.x);

        return vec3(rx, ry, rz);
    }
}

void main(void) {
    float L = 3.2 / float(max(@{sx}, max(@{sy},@{sz})));
    float K = float(@{K});

    int idx = int(gl_VertexID);

    int col  = idx % @{sx};
    idx     /= @{sx};

    int row  = idx % @{sy};
    int dep  = idx / @{sy};

    float x = float(col - @{sx}/2) * L;
    float y = float(row - @{sy}/2) * L;
    float z = float(dep - @{sz}/2) * L;

    vec3 E, H;

    if(tick == 0){
        E = vec3(0.0, 0.0, 0.0);
        H = vec3(0.0, 0.0, 0.0);
    }
    else{    
        E = vec3(texelFetch(inE, ivec3(col, row, dep), 0));
        H = vec3(texelFetch(inH, ivec3(col, row, dep), 0));
    
        if(tick % 2 == 0){

            vec3 rotH = calcRot(0, E, H, col, row, dep);
            E = E + K * rotH;
        }
        else{
            vec3 rotE = calcRot(1, E, H, col, row, dep);
            H = H - rotE;
        }
    }

    if(col == @{sx} / 2 && row == @{sy} / 2 && dep == @{sz} / 2){
        E.z += 0.01 * sin(2.0 * PI * float(tick) / 200.0);
    }

    outPos = vec3(x, y, z);
    outE   = E;
    outH   = H;
}
`
}