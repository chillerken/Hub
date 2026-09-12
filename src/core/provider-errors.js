// Store only known diagnostic codes: provider bodies can contain secrets or user input.
const codes=new Set(['insufficient_quota','invalid_api_key','model_not_found','rate_limit_exceeded','billing_hard_limit_reached','unsupported_parameter','invalid_value','context_length_exceeded','server_error']);
function providerError(status,body){const code=body?.error?.code;return codes.has(code)?code:`http_${Number(status)||0}`;}
function transportError(error){return ['TimeoutError','AbortError'].includes(error?.name)?'timeout':'network_error';}
const explanations={insufficient_quota:'OpenAI-tegoed of projectbudget ontbreekt',invalid_api_key:'De OpenAI-key wordt geweigerd',model_not_found:'Het ingestelde AI-model is niet beschikbaar',rate_limit_exceeded:'OpenAI-verzoeklimiet bereikt',billing_hard_limit_reached:'OpenAI-budgetlimiet bereikt',incomplete_output:'Het AI-antwoord was niet volledig',invalid_output:'Het AI-antwoord kon niet veilig worden verwerkt',timeout:'OpenAI antwoordde niet op tijd',network_error:'Verbinding met OpenAI mislukt',not_configured:'OpenAI is nog niet ingesteld'};
function explain(code){return explanations[code]||'OpenAI-aanvraag mislukt';}
module.exports={providerError,transportError,explain};
