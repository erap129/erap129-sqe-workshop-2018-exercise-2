import * as esprima from 'esprima';
import * as escodegen from 'escodegen';

var values = {};
var input_vector = [];
var global_i = 0;
var inFunction = false;

function resetCodeParams(){
    values = {};
    input_vector = [];
    global_i = 0;
    inFunction = false;
}

function jsonEqual(a,b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

const parseCode = (codeToParse) => {
    return esprima.parseScript(codeToParse, {loc:true});
};

const parseCodeNoLoc = (codeToParse) => {
    return esprima.parseScript(codeToParse);
};

function parseRegularBody(ast){
    if(ast.body.constructor === Array){
        let prev_global_i = global_i;
        global_i = 0;
        for (;global_i < ast.body.length; global_i++)
            substitute(ast.body[global_i], ast.body);
        if(ast.type == 'Program'){
            return ast;
        }
        global_i = prev_global_i;
    }
    else
        substitute(ast.body, ast);
}

function parseBody(ast){
    if(ast.type == 'FunctionDeclaration' && !inFunction)
        return parseBodyFuncDecl(ast);
    return parseRegularBody(ast);
}

function parseBodyFuncDecl(ast){
    inFunction = true;
    // substitute(ast.body, ast);
    parseRegularBody(ast);
    inFunction = false;
}

function removeFromFather(ast, father){
    for(var row in father)
        if(jsonEqual(father[row], ast)){
            father.splice(row, 1);
            global_i--;
        }
}

function parseExpressionStatement(ast, father){
    let replaceStr = replaceSingleExpr(ast.expression.right, true);
    values[escodegen.generate(ast.expression.left)] = '('+replaceStr+')';
    ast.expression.right = esprima.parseScript(replaceStr).body[0].expression;
    if(!input_vector.includes(ast.expression.left.name) && inFunction)
        removeFromFather(ast, father);
}

function storeArray(ast){
    let count = 0;
    for(let item in ast.init.elements){
        let replaceStr = escodegen.generate(ast.init.elements[item]);
        Object.keys(values).forEach(function(key) {
            replaceStr = replaceStr.replace(key, values[key]);
        });
        values[ast.id.name + '[' + count + ']'] = '('+replaceStr+')';
        count++;
    }
}

function parseVariableDeclaration(ast, father){
    for(let decl in ast.declarations){
        if(ast.declarations[decl].init.type == 'ArrayExpression')
            storeArray(ast.declarations[decl]);
        else{
            let replaceStr = escodegen.generate(ast.declarations[decl].init);
            Object.keys(values).forEach(function(key) {
                replaceStr = replaceStr.replace(key, values[key]);
            });
            values[ast.declarations[decl].id.name] = '('+replaceStr+')';
        }
    }
    if(inFunction)
        removeFromFather(ast, father);
}

function parseFunctionDeclaration(ast){
    for(var param in ast.params){
        values[ast.params[param].name] = ast.params[param].name;
        input_vector.push(ast.params[param].name);
    }
}

function parseWhileStatement(ast){
    ast.test = replaceSingleExpr(ast.test);
}

function parseReturnStatement(ast){
    ast.argument = replaceSingleExpr(ast.argument);
}

function parseIfStatement(ast){
    ast.test = replaceSingleExpr(ast.test);
    let old_values = JSON.parse(JSON.stringify(values));
    substitute(ast.consequent);
    values = JSON.parse(JSON.stringify(old_values));
    substitute(ast.alternate);
    values = JSON.parse(JSON.stringify(old_values));
}

function replaceSingleExpr(exprAst, raw=false){
    let replacedExpr = escodegen.generate(exprAst);
    Object.keys(values).forEach(function (key) {
        if(!input_vector.includes(key)) {
            replacedExpr = replacedExpr.replace(key, values[key]);
        }
    });
    if(raw)
        return replacedExpr;
    return esprima.parseScript(replacedExpr).body[0].expression;
}

var parseFunctions = {
    'ExpressionStatement': parseExpressionStatement,
    'VariableDeclaration': parseVariableDeclaration,
    'FunctionDeclaration': parseFunctionDeclaration,
    'IfStatement': parseIfStatement,
    'ReturnStatement': parseReturnStatement,
    'WhileStatement': parseWhileStatement
};

function substitute(ast, father=null){
    if(ast == null)
        return;
    if(parseFunctions.hasOwnProperty(ast.type))
        parseFunctions[ast.type](ast, father);
    if(ast.hasOwnProperty('body')){
        let res = parseBody(ast);
        if(ast.type == 'Program')
            return res;
    }
}

export {substitute};
export {parseCode};
export {parseCodeNoLoc};
export {resetCodeParams};
