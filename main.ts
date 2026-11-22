import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
// A level is a hallway with one to four rooms, and a box never leaves its room, so the
// level's push optimum is its rooms' optima summed. Each room is solved exactly by a
// breadth-first search over pushes; dead squares and frozen 2 x 2 blocks are pruned.
const V=[[0,-1,'u','U'],[0,1,'d','D'],[-1,0,'l','L'],[1,0,'r','R']],CAP=3e5
const IN=process.env.MAKEFUN_INPUT_DIR||'/input',OUT=process.env.MAKEFUN_OUTPUT_DIR||'/output'
const key=(a,l,n)=>{let k=l;for(const x of a)k=k*n+x;return k}
function parse(t){const r=t.split('\n').filter(s=>s.length),h=r.length,w=Math.max(...r.map(s=>s.length)),m=new Uint8Array(w*h).fill(1),g=[],b=[];let p=-1
for(let y=0;y<h;y++)for(let x=0;x<r[y].length;x++){const c=r[y][x];if(c=='#')continue;const i=y*w+x;m[i]=0;if('.*+'.includes(c))g.push(i);if('$*'.includes(c))b.push(i);if('@+'.includes(c))p=i}
for(let x=0;x<w;x++)m[x]=m[w*(h-1)+x]=1
for(let y=0;y<h;y++)m[y*w]=m[y*w+w-1]=1
return{w,m,g:g.sort((a,b)=>a-b),b:b.sort((a,b)=>a-b),p}}
function live(B){const{w,m,g}=B,L=new Uint8Array(m.length),q=[...g];for(const x of g)L[x]=1
for(let i=0;i<q.length;i++){const x=q[i];for(const[dx,dy]of V){const d=dy*w+dx,y=x-d;if(m[y]===0&&m[y-d]===0&&L[y]===0)L[y]=1,q.push(y)}}
return L}
function reach(B,o,f,S,st,K){const{w,m}=B;let l=f,n=0;K[n++]=f;S[f]=st
while(n>0){const p=K[--n];if(p<l)l=p;for(const[dx,dy]of V){const q=p+dy*w+dx;if(m[q]===0&&o[q]===0&&S[q]!==st)S[q]=st,K[n++]=q}}
return l}
function froz(B,o,G,t){const{w,m}=B
for(const a of[t,t-1,t-w,t-w-1]){const c=a+w,d=c+1
if((m[a]||o[a])&&(m[a+1]||o[a+1])&&(m[c]||o[c])&&(m[d]||o[d])&&((o[a]&&!G[a])||(o[a+1]&&!G[a+1])||(o[c]&&!G[c])||(o[d]&&!G[d])))return 1}
return 0}
function walk(B,o,f,t){const{w,m}=B;if(f==t)return'';const P=new Int32Array(m.length).fill(-1),H=new Array(m.length).fill(''),q=[f];P[f]=f
for(let i=0;i<q.length;i++){const p=q[i];if(p==t)break;for(const[dx,dy,c]of V){const y=p+dy*w+dx;if(!m[y]&&!o[y]&&P[y]<0)P[y]=p,H[y]=c,q.push(y)}}
let s='';for(let p=t;p!=f;p=P[p])s=H[p]+s;return s}
function solve(B,lim=CAP){const{w,m,g}=B,sz=m.length,G=new Uint8Array(sz),L=live(B),o=new Uint8Array(sz),S=new Int32Array(sz),M=new Int32Array(sz),K=new Int32Array(sz)
for(const x of g)G[x]=1
if(B.b.some(x=>!L[x]))return null
const done=a=>a.every(x=>G[x])
let st=0
const bs=[B.b.slice()],ps=[B.p],pa=[-1],ix=new Map
for(const x of B.b)o[x]=1
ix.set(key(B.b,reach(B,o,B.p,S,++st,K),sz),0)
for(const x of B.b)o[x]=0
let f=done(B.b)?0:-1
for(let h=0;f<0&&h<bs.length;h++){const bb=bs[h];for(const x of bb)o[x]=1
reach(B,o,ps[h],S,++st,K)
const here=st
for(let i=0;i<bb.length&&f<0;i++){const x=bb[i]
for(const[dx,dy]of V){const dd=dy*w+dx,t=x+dd
if(S[x-dd]!==here||m[t]!==0||o[t]!==0||L[t]!==1)continue
o[x]=0;o[t]=1
const fz=froz(B,o,G,t)
let k=-1,nx=null
if(!fz){nx=bb.slice();nx[i]=t;nx.sort((a,b)=>a-b);k=key(nx,reach(B,o,x,M,++st,K),sz)}
o[t]=0;o[x]=1
if(fz||ix.has(k))continue
if(bs.length>=lim)return null
ix.set(k,bs.length);bs.push(nx);ps.push(x);pa.push(h)
if(done(nx)){f=bs.length-1;break}}}
for(const x of bb)o[x]=0}
if(f<0)return null
const ch=[]
for(let s=f;s>0;s=pa[s])ch.push(s)
ch.reverse()
let mv='',pl=B.p,cb=B.b.slice()
for(const s of ch){const nb=bs[s],fr=cb.find(x=>nb.indexOf(x)<0),to=nb.find(x=>cb.indexOf(x)<0),dd=to-fr
for(const x of cb)o[x]=1
mv+=walk(B,o,pl,fr-dd)+(dd==1?'R':dd==-1?'L':dd==w?'D':'U')
for(const x of cb)o[x]=0
pl=fr;cb=nb}
return mv}
function end(w,p,s){for(const c of s.toLowerCase())p+=c=='u'?-w:c=='d'?w:c=='l'?-1:1;return p}
function rooms(B){const{w,m,g,b,p}=B,L=live(B),cut=new Uint8Array(m.length),row=(p/w)|0
for(let x=0;x<w;x++){const i=row*w+x;if(m[i]===0&&L[i]===0)cut[i]=1}
if(b.some(x=>cut[x]))return null
const lb=new Int32Array(m.length).fill(-1),R=[]
for(let s=0;s<m.length;s++){if(m[s]!==0||cut[s]!==0||lb[s]>=0)continue
const q=[s];lb[s]=R.length
for(let i=0;i<q.length;i++)for(const[dx,dy]of V){const y=q[i]+dy*w+dx;if(m[y]===0&&cut[y]===0&&lb[y]<0)lb[y]=R.length,q.push(y)}
R.push({b:[],g:[],done:0})}
for(const x of b){if(lb[x]<0)return null;R[lb[x]].b.push(x)}
for(const x of g){if(lb[x]<0)return null;R[lb[x]].g.push(x)}
const U=R.filter(r=>r.b.length)
return U.some(r=>r.b.length!==r.g.length)?null:U}
function play(B){const R=rooms(B)
if(R===null){const s=solve(B);return s===null?'':s}
let p=B.p,mv=''
for(const r of R){const wl=B.m.slice()
for(const o of R)if(o!==r)for(const x of o.done?o.g:o.b)wl[x]=1
const s=solve({w:B.w,m:wl,g:r.g,b:r.b,p})
if(s===null)return''
mv+=s;p=end(B.w,p,s);r.done=1}
return mv}
for(const id of readdirSync(IN).sort()){const s=play(parse(readFileSync(join(IN,id,'level.txt'),'utf8')))
mkdirSync(join(OUT,id),{recursive:true})
writeFileSync(join(OUT,id,'solution.txt'),s+'\n')}