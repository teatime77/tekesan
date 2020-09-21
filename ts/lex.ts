namespace bansho {

let SymbolTable : Array<string> = new  Array<string> (
    ",",
    ".",
    ";",
    "(",
    ")",
    "[",
    "]",
    "{",
    "}",
    "+",
    "-",
    "*",
    "/",
    "^",
    "%",
    "=",
    ":",
    "<",
    ">",

    "&&",
    "||",

    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    "!=",

    "++",
    "--",

    "!",
    "&",
    "|",
    "?",
);
    
let ReservedWords = [ 
    "if", "else", "return", "for", "while", "break", "continue", "switch", "case", "default",
    "in", "out", "uniform", "const", "precision", "highp", 
    "tick", "time", "timeDiff", "gl_Position", "gl_PointSize", "texelFetch", "sin", "cos", "sign", "abs",
];

let TypeNames = [ "bool", "int", "float", "vec2", "vec3", "vec4", "void", "sampler2D", "sampler3D", "mat3", "mat4" ];

function isLetter(s : string) : boolean {
    return s.length === 1 && ("a" <= s && s <= "z" || "A" <= s && s <= "Z");
}

function isDigit(s : string) : boolean {
    return s.length == 1 && "0123456789".indexOf(s) != -1;
}

function isLetterOrDigit(s : string) : boolean {
    return isLetter(s) || isDigit(s);
}

export enum TokenType{
    unknown,

    // 空白
    space,

    // 識別子
    identifier,

    // クラス
    type,

    // 数値
    Number,

    // 記号
    symbol,

    // 予約語
    reservedWord,

    // $n
    metaId,

    // End Of Text
    eot,

    // 指定なし
    any,

    // 行コメント
    lineComment,

    // ブロックコメント
    blockComment,

    // 改行
    newLine,

    // 文字列
    String,

    // 文字
    character,

    // 不正
    illegal
}
export enum TokenSubType {
    unknown,
    integer,
    float,
    double,
}

export class Token{
    typeTkn:TokenType;
    subType:TokenSubType;
    text:string;
    lineIndex:number;
    charPos:number;

    public constructor(type : TokenType, sub_type : TokenSubType, text : string, line_index : number, char_pos : number){
        //console.log("" + TokenType[type] + " " + TokenSubType[sub_type] + " " + text + " " + char_pos);
        this.typeTkn = type;
        this.subType = sub_type;
        this.text = text;
        this.lineIndex = line_index;
        this.charPos = char_pos;
    }
}


/*
    字句解析をして各文字の字句型の配列を得ます。
*/
export function Lex(text : string, skip_space: boolean = false) : Array<Token> {
    let line_idx: number = 0;
    let token_list : Token[] = new Array<Token>();

    // 現在の文字位置
    let pos = 0;

    // 行の先頭位置
    let line_top = 0;

    // 文字列の最後までループします。
    while (pos < text.length) {

        // 字句の開始位置
        let start_pos = pos;

        let token_type = TokenType.unknown;
        let sub_type : TokenSubType = TokenSubType.unknown;

        // 現在位置の文字
        let ch1 : string = text[pos];
        let cd1 = text.charCodeAt(pos);

        // 次の文字の位置。行末の場合は'\0'
        let ch2 : string;

        if (pos + 1 < text.length) {
            // 行末でない場合

            ch2 = text[pos + 1];
        }
        else {
            // 行末の場合

            ch2 = '\0';
        }

        if(ch1 == ' ' || ch1 == '\xA0'){
            while(pos < text.length && (text[pos] == ' ' || text[pos] == '\xA0')) pos++;
            token_type = TokenType.space;

            if(skip_space){
                continue;
            }
        }
        else if(ch1 == '\n'){
            pos++;
            token_type = TokenType.newLine;
        }
        else if(ch1 + ch2 == "//"){

            // 行末までスキップする。
            for(pos += 2; pos < text.length && text[pos] != '\n'; pos++);
            
            token_type = TokenType.lineComment;
        }
        else if (isLetter(ch1) || ch1 == '_') {
            // 識別子の最初の文字の場合

            // 識別子の文字の最後を探します。識別子の文字はユニコードカテゴリーの文字か数字か'_'。
            for (pos++; pos < text.length && (isLetterOrDigit(text[pos]) || text[pos] == '_'); pos++);

            // 識別子の文字列
            let name : string = text.substring(start_pos, pos);

            if (ReservedWords.includes(name)) {
                // 名前がキーワード辞書にある場合

                token_type = TokenType.reservedWord;
            }
            else if (TypeNames.includes(name)) {
                // 名前がキーワード辞書にある場合

                token_type = TokenType.type;
            }
            else {
                // 名前がキーワード辞書にない場合

                token_type = TokenType.identifier;
            }
        }
        else if (isDigit(ch1)) {
            // 数字の場合

            token_type = TokenType.Number;

            // 10進数の終わりを探します。
            for (; pos < text.length && isDigit(text[pos]); pos++);

            if (pos < text.length && text[pos] == '.') {
                // 小数点の場合

                pos++;

                // 10進数の終わりを探します。
                for (; pos < text.length && isDigit(text[pos]); pos++);

                if (text[pos] == 'f') {

                    pos++;
                    sub_type = TokenSubType.float;
                }
                else {

                    sub_type = TokenSubType.double;
                }
            }
            else {

                sub_type = TokenSubType.integer;
            }
        }
        else if (ch1 == '#' && isDigit(ch2)) {
            // $の後ろに数字がある場合

            token_type = TokenType.metaId;
            
            // 10進数の終わりを探します。
            for (pos++; pos < text.length && (isDigit(text[pos]) || text[pos] == '.'); pos++);
        }
        else if (SymbolTable.indexOf("" + ch1 + ch2) != -1) {
            // 2文字の記号の表にある場合

            token_type = TokenType.symbol;
            pos += 2;
        }
        else if (SymbolTable.indexOf("" + ch1) != -1) {
            // 1文字の記号の表にある場合

            token_type = TokenType.symbol;
            pos++;
        }
        else {
            // 不明の文字の場合

            token_type = TokenType.unknown;
            pos++;
            console.log("不明 {0}", text.substring(start_pos, pos), "");
//                    throw new Exception();
        }

        // 字句の文字列を得ます。
        let s : string = text.substring(start_pos, pos);

        // トークンを作り、トークンのリストに追加します。
        token_list.push(new Token(token_type, sub_type, s, line_idx, start_pos - line_top));

        if(token_type as TokenType == TokenType.illegal) {

            console.log("不正 {0} ^ {1}", text.substring(line_top, start_pos), s, "");
        }
    }

    // 各文字の字句型の配列を返します。
    return token_list;
}

function charIdx(div: ChildNode, rng: Range, idx: number) : number | undefined{
    if(div == rng.startContainer){
        return idx + rng.startOffset;        
    }
    for(let nd of div.childNodes){
        let i = charIdx(nd, rng, idx);
        if(i != undefined){
            return i;
        }

        let text: string;
        if(nd.nodeType == Node.TEXT_NODE){

            text = nd.nodeValue!;
        }
        else{

            text = nd.textContent!;
        }
        console.assert(typeof text == "string");

        idx += text.length;

    }

    return undefined;
}

function setChar(sel: Selection, div: HTMLDivElement, col: number){
    for(let nd of div.childNodes){
        if(col <= nd.textContent!.length){

            let rng = document.createRange();
            if(nd.nodeType == Node.TEXT_NODE){
                rng.setStart(nd, col);
            }
            else{
                console.assert(nd.childNodes.length == 1 && nd.firstChild!.nodeType == Node.TEXT_NODE);
                rng.setStart(nd.firstChild!, col);
            }
            sel.addRange(rng);

            return;
        }

        col -= nd.textContent!.length;
    }
}

let pasted : boolean = false;

export function initCodeEditor(){
    pkgVertexShaderDiv.addEventListener("paste", (ev: ClipboardEvent)=>{
        console.log("paste");
        pasted = true;
    });

    pkgVertexShaderDiv.addEventListener("input",function(){
        console.log("input");

        if(pasted){
            pasted = false;
            setTimeout(onCodeInput, 1);
        }
        else{
            onCodeInput();
        }
    });
}

function onCodeInput(){
    console.log("code format");

    let sel = window.getSelection()!;
    let rng = sel.getRangeAt(0);
    let div1;
    for(let nd = rng.startContainer as ChildNode;; nd = nd.parentElement!){
        if(nd == pkgVertexShaderDiv){
            break;
        }
        if(nd.nodeName == "DIV"){
            div1 = nd;
        }
    }
    console.log(`input ${sel.rangeCount} rng:[${rng}] ` );
    for(let div of pkgVertexShaderDiv.children){
        if(div.nodeName == "DIV" && div.firstChild != null && div.firstChild.nodeName == "SPAN"){
            // DIVの最初の子がSPANの場合

            let span = div.firstChild;
            if(span.firstChild != null && span.firstChild.nodeName == "DIV"){
                // SPANの最初の子がDIVの場合

                console.log("お引っ越し");

                // SPANのすべての子を、親のDIVの次に移動する。
                let next_nd = div.nextSibling;
                while(span.firstChild != null){
                    let nd = span.firstChild;
                    span.removeChild(nd);
                    pkgVertexShaderDiv.insertBefore(nd, next_nd);
                }

                // 元のDIVは削除する。
                pkgVertexShaderDiv.removeChild(div);
                break;
            }
        }
    }

    let changed = 0;
    for(let nd of pkgVertexShaderDiv.childNodes){

        if(nd.nodeType == Node.TEXT_NODE){

            console.log(`  ${nd.nodeName} ${nd.nodeValue!.trim()}` );            
        }
        else{
            if(nd.nodeName == "DIV"){
                let div = nd as HTMLDivElement;
                if(div.innerHTML == "" || div.innerHTML == "<br>"){//  || div.innerHTML == "<span><br></span>"
                    continue;
                }
                if(div.childNodes.length == 1 && div.childNodes[0].nodeName == "SPAN"){
                    let span = div.childNodes[0] as HTMLSpanElement;
                    if(span.childNodes.length == 1 && span.childNodes[0].nodeName == "BR"){
                        continue;
                    }
                }

                if(div.dataset.innerHTML == div.innerHTML){
                    continue;
                }
                changed++;

                let col = undefined;
                if(nd == div1){
                    col = charIdx(div, rng, 0);
                }

                let tokens = Lex(div.textContent!);
                div.innerHTML = "";

                for(let token of tokens){
                    if(token.typeTkn == TokenType.newLine){
                    
                        // let br = document.createElement("br");
                        // div.appendChild(br);
                    }
                    else {
                        addTokenNode(div, token);
                    }
                }
                // console.log(`  ${tokens.map(x => `[${x.typeTkn} ${x.typeTkn == TokenType.newLine ? "NL" : x.text}]`).join(" ")}` );

                if(col != undefined){

                    sel.removeAllRanges();
                    setChar(sel, div, col);
                }

                div.dataset.innerHTML = div.innerHTML;

                // console.log(`  ${div.tagName} col:${col}   [${div.textContent}] [${div.innerHTML} ] ` );
            }
        }
    }
    console.log(`changed : ${changed}`);
}

class Term {
    calc(values: { [name: string]: number }) : number {
        throw new Error();
    }
}

class RefVar extends Term{
    name: string;

    constructor(name: string){
        super();
        this.name = name;
    }

    calc(values: { [name: string]: number }) : number {
        let x = values[this.name];
        if(x == undefined){
            return NaN;
        }
        return x;
    }
}


class ConstNum extends Term{
    value: number;

    constructor(value: number){
        super();
        this.value = value;
    }

    calc(values: { [name: string]: number }) : number {
        return this.value;
    }
}

class App extends Term{
    opr : string;
    args: Term[];

    constructor(opr: string, args: Term[]){
        super();
        this.opr = opr;
        this.args = args.slice();
    }

    calc(values: { [name: string]: number }) : number {
        let val!: number;

        for(let [i, arg] of this.args.entries()){
            let n = arg.calc(values);

            if(i == 0){
                val = n;
            }
            else{
                switch(this.opr){
                case "+": val += n; break;
                case "-": val -= n; break;
                case "*": val *= n; break;
                case "/": val /= n; break;
                }
            }
        }

        return val;
    }
}

class Parser {
    tokens: Token[];
    token!: Token;
    values: { [name: string]: number };

    constructor(values: { [name: string]: number }, text: string){
        this.values = values;
        this.tokens = Lex(text, true);
        if(this.tokens.length == 0){
            
        }

        this.next();
    }

    next(){
        if(this.tokens.length == 0){

            this.token = new Token(TokenType.eot, TokenSubType.unknown, "", 0, 0);
        }
        else{

            this.token = this.tokens.shift()!;
        }
    }


    PrimaryExpression() {
        let trm : Term;

        if(this.token.typeTkn == TokenType.identifier){
            if(this.values[this.token.text] != undefined){
                trm = new RefVar(this.token.text);
                this.next();
            }
            else{
                throw new Error();
            }
        }
        else if(this.token.typeTkn == TokenType.Number){
            let n = parseFloat(this.token.text);
            if(isNaN(n)){
                throw new Error();
            }

            trm = new ConstNum(n);
            this.next();
        }
        else{
            throw new Error();
        }

        return trm;
    }

    MultiplicativeExpression(){
        let trm1 = this.PrimaryExpression();
        while(this.token.text == "*" || this.token.text == "/"){
            let app = new App(this.token.text, [trm1]);
            this.next();

            while(true){
                let trm2 = this.PrimaryExpression();
                app.args.push(trm2);
                
                if(this.token.text == app.opr){
                    this.next();
                }
                else{
                    trm1 = app;
                    break;
                }
            }
        }
    
        return trm1;
    }
    
    AdditiveExpression(){
        let trm1 = this.MultiplicativeExpression();
        while(this.token.text == "+" || this.token.text == "-"){
            let app = new App(this.token.text, [trm1]);
            this.next();

            while(true){
                let trm2 = this.MultiplicativeExpression();
                app.args.push(trm2);
                
                if(this.token.text == app.opr){
                    this.next();
                }
                else{
                    trm1 = app;
                    break;
                }
            }
        }

        return trm1;
    }

    Expression(){
        return this.AdditiveExpression();
    }
    
}

export function parseMath(values: { [name: string]: number }, text: string) : number {
    try{
        let parser = new Parser(values, text);
        let trm = parser.Expression();
        if(parser.token.typeTkn != TokenType.eot){
            throw new Error();
        }
        return trm.calc(values);
    }
    catch(e){
        return NaN;
    }
}

}