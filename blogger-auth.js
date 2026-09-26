(function(){
"use strict";
const U="https://gkqyaroprqajwoubnsvs.supabase.co";
const K="sb_publishable_R7vD8tuifiaNOAhOSQdAyw_Ie4OHa7f";
const REF="sb-gkqyaroprqajwoubnsvs-auth-token";

function msg(t){const e=document.getElementById("authmsg");if(e)e.textContent=t||""}
function val(id){const e=document.getElementById(id);return e?(e.value||"").trim():""}
async function request(path,body){
  const r=await fetch(U+path,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":K,
      "Authorization":"Bearer "+K
    },
    body:JSON.stringify(body)
  });
  const data=await r.json().catch(function(){return{}});
  if(!r.ok)throw new Error(data.error_description||data.msg||data.message||"Authentication failed.");
  return data;
}
function saveSession(s){
  if(!s||!s.access_token||!s.refresh_token||!s.user)return;
  const expires=Number(s.expires_in||3600);
  localStorage.setItem(REF,JSON.stringify({
    access_token:s.access_token,
    token_type:s.token_type||"bearer",
    expires_in:expires,
    expires_at:Math.floor(Date.now()/1000)+expires,
    refresh_token:s.refresh_token,
    user:s.user,
    weak_password:!!s.weak_password
  }));
}
async function login(){
  try{
    msg("Signing in...");
    const email=val("email");
    const password=document.getElementById("password")?.value||"";
    if(!email||!password){msg("Please enter your email and password.");return}
    const s=await request("/auth/v1/token?grant_type=password",{email:email,password:password});
    saveSession(s);
    location.reload();
  }catch(e){console.error(e);msg(e.message||"Login failed.")}
}
async function signup(){
  try{
    msg("Creating account...");
    const email=val("email");
    const password=document.getElementById("password")?.value||"";
    const username=val("username");
    if(!email||!password||!username){msg("Please fill in email, password and username.");return}
    const s=await request("/auth/v1/signup",{
      email:email,
      password:password,
      data:{username:username,full_name:username}
    });
    if(s.access_token)saveSession(s);
    if(s.user&&s.access_token){
      const r=await fetch(U+"/rest/v1/profiles",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "apikey":K,
          "Authorization":"Bearer "+s.access_token,
          "Prefer":"resolution=merge-duplicates"
        },
        body:JSON.stringify({id:s.user.id,username:username,full_name:username})
      });
      if(!r.ok)console.warn("Profile creation:",await r.text());
      location.reload();
    }else{
      msg("Account created. Check your email to confirm your account.");
    }
  }catch(e){console.error(e);msg(e.message||"Account creation failed.")}
}
function google(){
  msg("Opening Google sign-in...");
  const redirect=location.origin+location.pathname;
  location.href=U+"/auth/v1/authorize?provider=google&redirect_to="+encodeURIComponent(redirect);
}
function bind(){
  const a=document.getElementById("loginBtn"),b=document.getElementById("signupBtn"),g=document.getElementById("googleBtn");
  if(a&&!a.dataset.socialHubAuth){a.dataset.socialHubAuth="1";a.addEventListener("click",login,false)}
  if(b&&!b.dataset.socialHubAuth){b.dataset.socialHubAuth="1";b.addEventListener("click",signup,false)}
  if(g&&!g.dataset.socialHubAuth){g.dataset.socialHubAuth="1";g.addEventListener("click",google,false)}
}
window.socialHubBloggerLogin=login;
window.socialHubBloggerSignup=signup;
window.socialHubBloggerGoogle=google;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();