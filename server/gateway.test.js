const http=require('http');
const seen=[];
const up=http.createServer((req,res)=>{ if(req.url==='/exec'&&req.method==='POST'){ res.writeHead(302,{Location:'/final'}); return res.end(); }
  if(req.url==='/final'){ res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true,data:{echo:'x'}})); }
  res.end(); });
let bodies=[]; const up2=http.createServer((req,res)=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ bodies.push(b); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,data:JSON.parse(b).fn})); }); });
up2.listen(9101,()=>{
  process.env.APPS_SCRIPT_URL='http://localhost:9101/exec'; process.env.GATEWAY_KEY='sekreto'; process.env.RATE_LIMIT_PER_MIN='5'; process.env.MAX_BODY_MB='1';
  const {servidor}=require('./index.js');
  servidor.listen(9102,async()=>{
    const post=(b)=>fetch('http://localhost:9102/api',{method:'POST',body:typeof b==='string'?b:JSON.stringify(b)}).then(async r=>[r.status,await r.json()]);
    const ok=(c,m)=>{console.log((c?'ok: ':'FAIL: ')+m); if(!c)process.exitCode=1;};
    let r=await fetch('http://localhost:9102/'); let t=await r.text(); ok(r.status===200&&t.includes('window.APP_API_URL="/api"')&&!t.includes('<!--CONFIG-->'),'sirve la interfaz con /api');
    r=await fetch('http://localhost:9102/healthz'); ok(r.status===200,'healthz');
    [s,j]=await post({fn:'obtenerPanel',args:['tk']}); ok(s===200&&j.ok&&j.data==='obtenerPanel','reenvía función permitida');
    ok(JSON.parse(bodies[0]).key==='sekreto','inyecta la clave de pasarela; navegador no la envía');
    [s,j]=await post({fn:'restablecerClaves',args:[]}); ok(s===400&&!j.ok,'bloquea función no permitida');
    [s,j]=await post('xx'); ok(s===400,'JSON inválido');
    [s,j]=await post({fn:'obtenerPanel',args:['a'.repeat(2*1024*1024)]}); ok(s===413||s===400,'cuerpo grande rechazado: '+s);
    [s,j]=await post({fn:'obtenerPanel',args:[]}); [s,j]=await post({fn:'obtenerPanel',args:[]}); [s,j]=await post({fn:'obtenerPanel',args:[]});
    ok(s===429,'límite de tasa: '+s);
    [s,j]=await (await fetch('http://localhost:9102/otra')).status===404?[404]:[0]; ok(s===404,'404');
    // redirección 302 estilo Apps Script
    up.listen(9103,async()=>{
      const {servidor:_}=require('./index.js');
      process.exit(process.exitCode||0);
    });
  });
});
