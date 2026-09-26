(function(){
"use strict";

const U="https://gkqyaroprqajwoubnsvs.supabase.co";
const K="sb_publishable_R7vD8tuifiaNOAhOSQdAyw_Ie4OHa7f";

let authClient=null;

function msg(t){
  const e=document.getElementById("authmsg");
  if(e)e.textContent=t||"";
}

function val(id){
  const e=document.getElementById(id);
  return e?(e.value||"").trim():"";
}

function getClient(){
  if(authClient)return authClient;
  if(window.supabase&&typeof window.supabase.createClient==="function"){
    authClient=window.supabase.createClient(U,K,{
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    });
    return authClient;
  }
  return null;
}

async function waitForClient(){
  const existing=getClient();
  if(existing)return existing;
  for(let i=0;i<40;i++){
    await new Promise(function(resolve){setTimeout(resolve,100)});
    const c=getClient();
    if(c)return c;
  }
  throw new Error("Supabase could not be loaded. Please refresh the page.");
}

async function ensureProfile(client,user,username){
  if(!user)return;
  const meta=user.user_metadata||{};
  const identity=(user.identities||[]).find(function(item){return item.provider==="google"});
  const identityData=identity?.identity_data||{};
  const fullName=(meta.full_name||meta.name||identityData.full_name||identityData.name||username||"").trim();
  const avatarUrl=meta.avatar_url||meta.picture||identityData.avatar_url||identityData.picture||"";
  let name=(username||meta.username||"").trim();
  if(!name){
    const email=(user.email||"").trim();
    const base=(fullName||email.split("@")[0]||"user").toLowerCase()
      .replace(/[^a-z0-9]+/g,".")
      .replace(/^\.|\.$/g,"")
      .slice(0,24)||"user";
    name=base+"."+user.id.slice(0,6).toLowerCase();
  }
  const payload={id:user.id,username:name,full_name:fullName||name};
  if(avatarUrl)payload.avatar_url=avatarUrl;
  const result=await client.from("profiles").upsert(payload,{onConflict:"id"});
  if(result.error)console.warn("SocialHub profile sync:",result.error.message);
}

async function login(){
  try{
    msg("Signing in...");
    const email=val("email");
    const password=document.getElementById("password")?.value||"";
    if(!email||!password){
      msg("Please enter your email and password.");
      return;
    }
    const client=await waitForClient();
    const result=await client.auth.signInWithPassword({email:email,password:password});
    if(result.error)throw result.error;
    if(result.data?.user)await ensureProfile(client,result.data.user,"");
    location.reload();
  }catch(e){
    console.error("SocialHub Blogger login:",e);
    msg(e.message||"Login failed.");
  }
}

async function signup(){
  try{
    msg("Creating account...");
    const email=val("email");
    const password=document.getElementById("password")?.value||"";
    const username=val("username");
    if(!email||!password||!username){
      msg("Please fill in email, password and username.");
      return;
    }
    const client=await waitForClient();
    const result=await client.auth.signUp({
      email:email,
      password:password,
      options:{data:{username:username,full_name:username}}
    });
    if(result.error)throw result.error;
    if(result.data?.user&&result.data?.session){
      await ensureProfile(client,result.data.user,username);
      location.reload();
    }else{
      msg("Account created. Check your email to confirm your account.");
    }
  }catch(e){
    console.error("SocialHub Blogger signup:",e);
    msg(e.message||"Account creation failed.");
  }
}

async function google(){
  try{
    msg("Opening Google sign-in...");
    const client=await waitForClient();
    const redirect=location.origin+location.pathname;
    const result=await client.auth.signInWithOAuth({
      provider:"google",
      options:{
        scopes:"openid email profile",
        redirectTo:redirect
      }
    });
    if(result.error)throw result.error;
  }catch(e){
    console.error("SocialHub Blogger Google sign-in:",e);
    msg(e.message||"Google sign-in could not be started.");
  }
}

function bind(){
  const a=document.getElementById("loginBtn");
  const b=document.getElementById("signupBtn");
  const g=document.getElementById("googleBtn");
  if(a&&!a.dataset.socialHubAuth){
    a.dataset.socialHubAuth="1";
    a.addEventListener("click",login,false);
  }
  if(b&&!b.dataset.socialHubAuth){
    b.dataset.socialHubAuth="1";
    b.addEventListener("click",signup,false);
  }
  if(g&&!g.dataset.socialHubAuth){
    g.dataset.socialHubAuth="1";
    g.addEventListener("click",google,false);
  }
}

window.socialHubBloggerLogin=login;
window.socialHubBloggerSignup=signup;
window.socialHubBloggerGoogle=google;

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",bind,{once:true});
}else{
  bind();
}
})();