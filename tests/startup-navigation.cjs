const {JSDOM}=require(process.env.NODARA_QA_NODE_MODULES+'/jsdom'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function scenario(mode){
 const dom=new JSDOM('<nav id="nav"></nav><nav id="mobile"></nav><nav id="domain-subnav"></nav><main id="main">Connecting</main>',{url:'https://nodara.test/',pretendToBeVisual:true});
 let releaseSession;const sessionPromise=new Promise(r=>releaseSession=r),renders=[];
 const ctx=vm.createContext({window:dom.window,document:dom.window.document,MutationObserver:dom.window.MutationObserver,setTimeout,clearTimeout,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),console,sessionPromise,renders});
 const modules=new Map();
 async function load(file){if(modules.has(file))return modules.get(file);let source;
 if(file.endsWith('/auth-session.js'))source=`export async function getSession(){return globalThis.sessionPromise} export async function ensureWorkspace(){} export async function signInWithPassword(){return {user:{email:'test'}}} export async function signUpWithPassword(){return {session:{user:{email:'test'}}}} export async function signOut(){}`;
 else if(file.endsWith('/dashboard-workspaces.js'))source=`export async function renderHomeDashboard(main){globalThis.renders.push('home');main.innerHTML='<h1>Today</h1>'} export async function renderDomainDashboard(main,domain){main.innerHTML='<h1>'+domain+'</h1>'}`;
 else if(file.endsWith('/live-data.js'))source=`export function getInventorySnapshot(){} export function findExpectedReceipts(){} export function findInventory(){} export function createWarehouseReceiptTree(){}`;
 else if(file.endsWith('/cargo-tree-builder.js'))source=`export const PACKAGE_TYPES=[];export function makePackage(){} export function makeItem(){} export function repeatPackage(){} export function summarizeTree(){}`;
 else if(/operational-context/.test(file))source='';
 else source=fs.readFileSync(file,'utf8');
 const mod=new vm.SourceTextModule(source,{context:ctx,identifier:file});modules.set(file,mod);await mod.link(spec=>load(path.resolve(path.dirname(file),spec.split('?')[0])));return mod;}
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const seen=[];const observer=new dom.window.MutationObserver(()=>seen.push(ctx.document.querySelector('#main').textContent));observer.observe(ctx.document.querySelector('#main'),{childList:true,subtree:true});
 await (await load(root+'/src/live-app.js')).evaluate();await wait(20);assert.equal(renders.length,0,'Dashboard starts before session is resolved');
 releaseSession(mode==='returning'?{user:{email:'test'}}:null);await wait(20);
 if(mode==='login'){assert(ctx.document.querySelector('#signin'));await ctx.document.querySelector('#signin').onclick();}
 if(mode==='signup'){assert(ctx.document.querySelector('#signup'));await ctx.document.querySelector('#signup').onclick();}
 assert.equal(ctx.document.querySelector('h1').textContent,'Today');assert.equal(renders.length,1);assert(!ctx.document.querySelector('[data-go]'));assert(seen.every(x=>!x.includes('Ready.')));
 await ctx.window.nodaraGo('warehouse_dashboard');assert.equal(ctx.window.__nodaraRoute,'warehouse_dashboard');
 ctx.document.querySelector('#nav').innerHTML='<button data-go="home">Command</button>';await wait(30);assert(!ctx.document.querySelector('[data-go]'));assert.equal(ctx.window.__nodaraRoute,'warehouse_dashboard');assert.equal(ctx.document.querySelector('h1').textContent,'warehouse');
 await wait(1250);assert.equal(renders.length,1,'Delayed shell repair reset current screen');assert.equal(ctx.document.querySelector('h1').textContent,'warehouse');observer.disconnect();dom.window.close();
}
(async()=>{for(const mode of ['returning','login','signup'])await scenario(mode);console.log('Returning-session startup, sign-in, signup and navigation repairs passed; no legacy screen or delayed home reset.');})().catch(e=>{console.error(e);process.exit(1)});
