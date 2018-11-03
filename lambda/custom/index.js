/* eslint-disable  func-names */
/* eslint-disable  no-console */

const Alexa = require('ask-sdk');
const AWS = require('aws-sdk');
const LRU = require("lru-cache");

// Change this to your Alexa enabled AWS region
AWS.config.update({ region: 'eu-west-1' });

// Make sure your lambda role has the following policies: AWSLambdaBasicExecutionRole and TranslateReadOnly 
var translate = new AWS.Translate();

// String hashing function for the cache
String.prototype.hashCode = function() {
  var hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

const cache = LRU(256);

const HELP_REPROMPT = '¿Cómo te puedo ayudar?';
const HELP_MESSAGE = 'Puedes decirme dime una curiosidad de gatos, o, puedes decir para... ' + HELP_REPROMPT;
const STOP_MESSAGE = '¡Adiós!';
const GENERIC_ERROR = 'Perdona ha ocurrido un error.';
const SERVICE_ERROR = '¡Perdona, no hemos podido recuperar una curiosidad!';

const GetNewFactHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'LaunchRequest'
      || (request.type === 'IntentRequest'
        && request.intent.name === 'GetNewFactIntent');
  },
  async handle(handlerInput) {
    let outputSpeech = SERVICE_ERROR;
    let fact;
    await getData('https://catfact.ninja/fact')
      .then((response) => {
        const data = JSON.parse(response);
        fact = data.fact;
      })
      .catch((err) => {
        outputSpeech = err.message;
    });
    if(fact) {
      let i = Math.floor(Math.random() * catSounds.length);
      const catSound = catSounds[i];
      outputSpeech = catSound + ' ';

      let translation;
      const hash = fact.hashCode();
      const cachedString = cache.get(hash);
      if(cachedString){
        translation = cachedString;
      } else {
        var params = {
          SourceLanguageCode: 'en',
          TargetLanguageCode: 'es',
          Text: fact
        };
   
        try {
          const fulfilledPromise = await translate.translateText(params).promise();
          translation = fulfilledPromise.TranslatedText;
          cache.set(hash, translation);
        } catch (err) {
          translation = SERVICE_ERROR;
        }
      }

      outputSpeech += switchVoice(translation, 'Enrique');
    }
    return handlerInput.responseBuilder
      .speak(outputSpeech)
      .getResponse();

  }
};

const HelpHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(switchVoice(HELP_MESSAGE, 'Enrique'))
      .reprompt(switchVoice(HELP_REPROMPT, 'Enrique'))
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && (request.intent.name === 'AMAZON.CancelIntent'
        || request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(switchVoice(STOP_MESSAGE, 'Enrique'))
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak(switchVoice(GENERIC_ERROR, 'Enrique'))
      .reprompt(switchVoice(GENERIC_ERROR, 'Enrique'))
      .getResponse();
  },
};

const getData = function (url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? require('https') : require('http');
    const request = client.get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode > 299) {
        reject(new Error('Failed with status code: ' + response.statusCode));
      }
      const body = [];
      response.on('data', (chunk) => body.push(chunk));
      response.on('end', () => resolve(body.join('')));
    });
    request.on('error', (err) => reject(err))
  })
};

// Spanish, European (es-ES): Enrique / Conchita
// Spanish, US (es-US): Miguel / Penelope (not supported yet)
function switchVoice(text, voice_name) {
  if (text){
    return "<voice name='" + voice_name + "'>" + text + "</voice>"
  }
}

const catSounds = [
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_angry_meow_1x_01'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_angry_meow_1x_02'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_angry_screech_1x_01'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_long_meow_1x_01'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_meow_1x_01'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_meow_1x_02'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_01'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_02'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_03'/>",
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_meow_01'/>"
];

const skillBuilder = Alexa.SkillBuilders.standard();

exports.handler = skillBuilder
  .addRequestHandlers(
    GetNewFactHandler,
    HelpHandler,
    ExitHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
