// Store only known diagnostic codes: provider bodies can contain secrets or user input.
const codes=new Set(['insufficient_quota','invalid_api_key','model_not_found','rate_limit_exceeded','billing_hard_limit_reached','unsupported_parameter','invalid_value','context_length_exceeded','server_error']);
function providerError(status,body){
 for(const code of [body?.error?.code,body?.error?.type,body?.code,body?.type])if(codes.has(code))return code;
 // Some gateways return a plain error string. Categorize it without ever logging it.
 const description=JSON.stringify(body||{});
 if(status===429&&/insufficient[_ ](?:quota|credit|fund)|(?:no|zero|without).{0,30}credits|out of credits|exceeded.*(?:quota|budget)|billing.*(?:limit|inactive)|credit balance|budget.*exceed|not.{0,20}(?:enough|sufficient).{0,20}credits|add.{0,20}credits/i.test(description))return 'insufficient_quota';
 if(status===429&&/rate[_ ]limit|too many requests|tokens per min|requests per min/i.test(description))return 'rate_limit_exceeded';
 return `http_${Number(status)||0}`;
}
function transportError(error){return ['TimeoutError','AbortError'].includes(error?.name)?'timeout':'network_error';}
const explanations={insufficient_quota:'OpenAI-tegoed of projectbudget ontbreekt',invalid_api_key:'De OpenAI-key wordt geweigerd',model_not_found:'Het ingestelde AI-model is niet beschikbaar',rate_limit_exceeded:'OpenAI-verzoeklimiet bereikt',billing_hard_limit_reached:'OpenAI-budgetlimiet bereikt',incomplete_output:'Het AI-antwoord was niet volledig',invalid_output:'Het AI-antwoord kon niet veilig worden verwerkt',timeout:'OpenAI antwoordde niet op tijd',network_error:'Verbinding met OpenAI mislukt',not_configured:'OpenAI is nog niet ingesteld'};
function explain(code){return explanations[code]||'OpenAI-aanvraag mislukt';}
module.exports={providerError,transportError,explain};
