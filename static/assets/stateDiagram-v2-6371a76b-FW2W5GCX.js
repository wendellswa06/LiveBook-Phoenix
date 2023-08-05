import{a as V,b as Y,c as W,d as z,e as w,f as q,g as G,h as K}from"./chunk-DXW4N2CS.js";import{a as U}from"./chunk-BMK5W6E7.js";import"./chunk-UIIKMIGR.js";import"./chunk-F2X5DNEE.js";import"./chunk-4OMZAWBS.js";import{a as H}from"./chunk-QFWTWYMO.js";import"./chunk-2MTWH372.js";import{Ka as Q,b as it,c as ct,da as l,h as y,ha as g,na as h,oa as J,z as rt}from"./chunk-KU2GO2AH.js";import"./chunk-CIZ5P7CP.js";import{h as R}from"./chunk-2YVZDWG7.js";var mt=R(it(),1),Ht=R(ct(),1),Ut=R(rt(),1);var x="rect",N="rectWithTitle",lt="start",at="end",dt="divider",Et="roundedWithTitle",pt="note",St="noteGroup",_="statediagram",Tt="state",_t=`${_}-${Tt}`,Z="transition",ut="note",bt="note-edge",ft=`${Z} ${bt}`,Dt=`${_}-${ut}`,ht="cluster",At=`${_}-${ht}`,yt="cluster-alt",gt=`${_}-${yt}`,F="parent",j="note",xt="state",k="----",$t=`${k}${j}`,X=`${k}${F}`,I="fill:none",tt="fill: #333",et="c",ot="text",st="normal",$={},E=0,Ct=function(t){let n=Object.keys(t);for(let e of n)t[e]},Rt=function(t,n){l.trace("Extracting classes"),n.db.clear();try{return n.parser.parse(t),n.db.extract(n.db.getRootDocV2()),n.db.getClasses()}catch(e){return e}};function wt(t){return t==null?"":t.classes?t.classes.join(" "):""}function L(t="",n=0,e="",i=k){let c=e!==null&&e.length>0?`${i}${e}`:"";return`${xt}-${t}${c}-${n}`}var A=(t,n,e,i,c,r)=>{let o=e.id,u=wt(i[o]);if(o!=="root"){let S=x;e.start===!0&&(S=lt),e.start===!1&&(S=at),e.type!==w&&(S=e.type),$[o]||($[o]={id:o,shape:S,description:g.sanitizeText(o,h()),classes:`${u} ${_t}`});let s=$[o];e.description&&(Array.isArray(s.description)?(s.shape=N,s.description.push(e.description)):s.description.length>0?(s.shape=N,s.description===o?s.description=[e.description]:s.description=[s.description,e.description]):(s.shape=x,s.description=e.description),s.description=g.sanitizeTextOrArray(s.description,h())),s.description.length===1&&s.shape===N&&(s.shape=x),!s.type&&e.doc&&(l.info("Setting cluster for ",o,P(e)),s.type="group",s.dir=P(e),s.shape=e.type===q?dt:Et,s.classes=s.classes+" "+At+" "+(r?gt:""));let T={labelStyle:"",shape:s.shape,labelText:s.description,classes:s.classes,style:"",id:o,dir:s.dir,domId:L(o,E),type:s.type,padding:15};if(T.centerLabel=!0,e.note){let a={labelStyle:"",shape:pt,labelText:e.note.text,classes:Dt,style:"",id:o+$t+"-"+E,domId:L(o,E,j),type:s.type,padding:15},d={labelStyle:"",shape:St,labelText:e.note.text,classes:s.classes,style:"",id:o+X,domId:L(o,E,F),type:"group",padding:0};E++;let b=o+X;t.setNode(b,d),t.setNode(a.id,a),t.setNode(o,T),t.setParent(o,b),t.setParent(a.id,b);let p=o,f=a.id;e.note.position==="left of"&&(p=a.id,f=o),t.setEdge(p,f,{arrowhead:"none",arrowType:"",style:I,labelStyle:"",classes:ft,arrowheadStyle:tt,labelpos:et,labelType:ot,thickness:st})}else t.setNode(o,T)}n&&n.id!=="root"&&(l.trace("Setting node ",o," to be child of its parent ",n.id),t.setParent(o,n.id)),e.doc&&(l.trace("Adding nodes children "),Gt(t,e,e.doc,i,c,!r))},Gt=(t,n,e,i,c,r)=>{l.trace("items",e),e.forEach(o=>{switch(o.stmt){case W:A(t,n,o,i,c,r);break;case w:A(t,n,o,i,c,r);break;case z:{A(t,n,o.state1,i,c,r),A(t,n,o.state2,i,c,r);let u={id:"edge"+E,arrowhead:"normal",arrowTypeEnd:"arrow_barb",style:I,labelStyle:"",label:g.sanitizeText(o.description,h()),arrowheadStyle:tt,labelpos:et,labelType:ot,thickness:st,classes:Z};t.setEdge(o.state1.id,o.state2.id,u,E),E++}break}})},P=(t,n=Y)=>{let e=n;if(t.doc)for(let i=0;i<t.doc.length;i++){let c=t.doc[i];c.stmt==="dir"&&(e=c.value)}return e},Nt=async function(t,n,e,i){l.info("Drawing state diagram (v2)",n),$={},i.db.getDirection();let{securityLevel:c,state:r}=h(),o=r.nodeSpacing||50,u=r.rankSpacing||50;l.info(i.db.getRootDocV2()),i.db.extract(i.db.getRootDocV2()),l.info(i.db.getRootDocV2());let S=i.db.getStates(),s=new H({multigraph:!0,compound:!0}).setGraph({rankdir:P(i.db.getRootDocV2()),nodesep:o,ranksep:u,marginx:8,marginy:8}).setDefaultEdgeLabel(function(){return{}});A(s,void 0,i.db.getRootDocV2(),S,i.db,!0);let T;c==="sandbox"&&(T=y("#i"+n));let a=c==="sandbox"?y(T.nodes()[0].contentDocument.body):y("body"),d=a.select(`[id="${n}"]`),b=a.select("#"+n+" g");await U(b,s,["barb"],_,n);let p=8;Q.insertTitle(d,"statediagramTitleText",r.titleTopMargin,i.db.getDiagramTitle());let f=d.node().getBBox(),v=f.width+p*2,O=f.height+p*2;d.attr("class",_);let B=d.node().getBBox();J(d,O,v,r.useMaxWidth);let M=`${B.x-p} ${B.y-p} ${v} ${O}`;l.debug(`viewBox ${M}`),d.attr("viewBox",M);let nt=document.querySelectorAll('[id="'+n+'"] .edgeLabel .label');for(let C of nt){let m=C.getBBox(),D=document.createElementNS("http://www.w3.org/2000/svg",x);D.setAttribute("rx",0),D.setAttribute("ry",0),D.setAttribute("width",m.width),D.setAttribute("height",m.height),C.insertBefore(D,C.firstChild)}},Lt={setConf:Ct,getClasses:Rt,draw:Nt},Wt={parser:V,db:G,renderer:Lt,styles:K,init:t=>{t.state||(t.state={}),t.state.arrowMarkerAbsolute=t.arrowMarkerAbsolute,G.clear()}};export{Wt as diagram};
