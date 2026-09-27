(function(){
"use strict";

const U="https://gkqyaroprqajwoubnsvs.supabase.co";
const K="sb_publishable_R7vD8tuifiaNOAhOSQdAyw_Ie4OHa7f";
let authClient=null;
let authBound=false;

function el(id){return document.getElementById(id)}
function msg(t){const e=el("authmsg");if(e)e.textContent=t||""}
function value(id){const e=el(id);return e?(e.value||"").trim():""}

function getClient(){
  if(authClient)return authClient;
  if(window.supabase&&typeof window.supabase.createClient==="function"){
    authClient=window.supabase.createClient(U,K,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    return authClient;
  }
  return null;
}
async function waitForClient(){
  for(let i=0;i<60;i++){
    const c=getClient();
    if(c)return c;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error("Supabase could not be loaded. Please refresh the page.");
}

async function ensureProfile(client,user,username){
  if(!user)return;
  const meta=user.user_metadata||{};
  const identity=(user.identities||[]).find(x=>x.provider==="google");
  const identityData=identity?.identity_data||{};
  const fullName=(meta.full_name||meta.name||identityData.full_name||identityData.name||username||"").trim();
  const avatarUrl=meta.avatar_url||meta.picture||identityData.avatar_url||identityData.picture||"";
  let name=(username||meta.username||"").trim();
  if(!name){
    const email=(user.email||"").trim();
    name=((fullName||email.split("@")[0]||"user").toLowerCase()
      .replace(/[^a-z0-9]+/g,".")
      .replace(/^\.|\.$/g,"").slice(0,24)||"user")+"."+user.id.slice(0,6).toLowerCase();
  }
  const payload={id:user.id,username:name,full_name:fullName||name};
  if(avatarUrl)payload.avatar_url=avatarUrl;
  const r=await client.from("profiles").upsert(payload,{onConflict:"id"});
  if(r.error)console.warn("SocialHub profile sync:",r.error.message);
}

function showLogin(){
  const a=el("authTitle"),s=el("authSubtitle"),f=el("signupFields");
  if(a)a.textContent="Welcome back";
  if(s)s.textContent="Sign in to continue to SocialHub.";
  if(f)f.classList.add("hidden");
  el("loginBtn")?.classList.remove("hidden");
  el("signupBtn")?.classList.add("hidden");
  el("switchSignupBtn")?.classList.remove("hidden");
  el("switchLoginBtn")?.classList.add("hidden");
  el("password")?.setAttribute("autocomplete","current-password");
  msg("");
}
function showSignup(){
  const a=el("authTitle"),s=el("authSubtitle"),f=el("signupFields");
  if(a)a.textContent="Create your SocialHub account";
  if(s)s.textContent="Join SocialHub and connect with your community.";
  if(f)f.classList.remove("hidden");
  el("loginBtn")?.classList.add("hidden");
  el("signupBtn")?.classList.remove("hidden");
  el("switchSignupBtn")?.classList.add("hidden");
  el("switchLoginBtn")?.classList.remove("hidden");
  el("password")?.setAttribute("autocomplete","new-password");
  el("username")?.focus();
  msg("");
}

async function login(e){
  if(e)e.preventDefault();
  try{
    msg("Signing in...");
    const email=value("email"), password=el("password")?.value||"";
    if(!email||!password){msg("Please enter your email and password.");return false}
    const client=await waitForClient();
    const r=await client.auth.signInWithPassword({email,password});
    if(r.error)throw r.error;
    if(r.data?.user)await ensureProfile(client,r.data.user,"");
    location.reload();
  }catch(e){
    console.error("SocialHub Blogger login:",e);
    msg(e.message||"Login failed.");
  }
  return false;
}

async function signup(){
  try{
    msg("Creating account...");
    const email=value("email"), password=el("password")?.value||"";
    const username=value("username"), gender=value("gender");
    const dateOfBirth=value("dateOfBirth"), mobile=value("mobile");
    if(!email||!password||!username||!gender||!dateOfBirth||!mobile){
      msg("Please fill in all signup fields."); return false;
    }
    if(new Date(dateOfBirth+"T00:00:00")>new Date()){
      msg("Date of birth cannot be in the future."); return false;
    }
    const client=await waitForClient();
    const r=await client.auth.signUp({
      email,password,
      options:{data:{username,full_name:username,gender,date_of_birth:dateOfBirth,mobile}}
    });
    if(r.error)throw r.error;
    const user=r.data?.user;
    const session=r.data?.session;
    if(session?.user){
      await ensureProfile(client,session.user,username);
      msg("Account created. Signing you in...");
      location.reload();
      return false;
    }
    if(user){
      msg("Account created. Please confirm your email, then return here and log in.");
      showLogin();
      return false;
    }
    msg("Account could not be completed.");
  }catch(e){
    console.error("SocialHub Blogger signup:",e);
    msg(e.message||"Account creation failed.");
  }
  return false;
}

async function google(){
  try{
    msg("Opening Google sign-in...");
    const client=await waitForClient();
    const r=await client.auth.signInWithOAuth({
      provider:"google",
      options:{scopes:"openid email profile",redirectTo:location.origin+location.pathname}
    });
    if(r.error)throw r.error;
  }catch(e){
    console.error("SocialHub Blogger Google sign-in:",e);
    msg(e.message||"Google sign-in could not be started.");
  }
}

function bind(){
  if(authBound)return;
  const form=el("socialHubAuthForm");
  if(!form)return;
  authBound=true;
  // Take ownership of the auth controls so Blogger cannot submit/reload the page.
  form.addEventListener("submit",login,true);
  el("loginBtn")?.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();login(e)},true);
  el("signupBtn")?.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();signup()},true);
  el("switchSignupBtn")?.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();showSignup()},true);
  el("switchLoginBtn")?.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();showLogin()},true);
  el("googleBtn")?.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();google()},true);
  showLogin();
}

async function boot(){
  try{
    const client=await waitForClient();
    bind();
    const r=await client.auth.getSession();
    const session=r.data?.session||null;
    const auth=el("auth"),site=el("site");
    if(session?.user){
      if(auth)auth.classList.add("hidden");
      if(site)site.classList.remove("hidden");
      try{await ensureProfile(client,session.user,"")}catch(e){console.warn(e)}
    }else{
      if(site)site.classList.add("hidden");
      if(auth)auth.classList.remove("hidden");
      showLogin();
    }
  }catch(e){
    console.error("SocialHub Blogger auth boot:",e);
    const auth=el("auth"),site=el("site");
    if(site)site.classList.add("hidden");
    if(auth)auth.classList.remove("hidden");
    msg("Authentication service is unavailable. Please try again.");
  }
}

window.socialHubBloggerLogin=login;
window.socialHubBloggerSignup=signup;
window.socialHubBloggerGoogle=google;
window.socialHubBloggerShowLogin=showLogin;
window.socialHubBloggerShowSignup=showSignup;
window.socialHubBloggerSignupMode=signup;

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
})();