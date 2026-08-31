import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/injury-trigger.js';

const env={ALLOWED_ORIGIN:'https://example.github.io',GITHUB_REPOSITORY:'owner/repo',GITHUB_TOKEN:'server-secret'};

test('trigger rejects a request from an untrusted origin',async()=>{
  const response=await worker.fetch(new Request('https://worker.example/trigger',{method:'POST',headers:{Origin:'https://evil.example'}}),env);
  assert.equal(response.status,403);
});

test('trigger dispatches the manual workflow without exposing the token',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('/runs?'))return Response.json({workflow_runs:[]});
    return new Response(null,{status:204});
  });
  const request=new Request('https://worker.example/trigger',{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN}});
  const response=await worker.fetch(request,env);
  assert.equal(response.status,202);
  assert.match(calls[1].url,/scrape-infortuni\.yml\/dispatches$/);
  assert.equal(JSON.parse(calls[1].init.body).ref,'main');
  assert.equal((await response.text()).includes(env.GITHUB_TOKEN),false);
});
