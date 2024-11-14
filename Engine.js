const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const AIManager = require('./AIManager');
const { getTelegramAnalysis } = require('./TelegramAI');
const { getTwitterAnalysis } = require('./TwitterAI');

const config = require('./config.json');

const openAiKey = config.openAiKey;
const apiKey = config.claudeApiKey;

const anthropic = new Anthropic({
    apiKey: apiKey,
});

const client = new OpenAI({
    apiKey: openAiKey,
});

let pastActions = [];

let btcPrice = 0;
let ethPrice = 0;
let solPrice = 0;

/*
    This is the main function of the engine. It's used to get the next action to take.
*/
async function getEngineAction() {

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4',
            messages: [{
                role: 'user', content:
                    `
you're @AnonExeSOL, some random kid who started trading shitcoins with your college loan money and somehow turned it into a multimillion dollar portfolio. you trade mostly SOL ecosystem bc you think ethereum maxis are cringe and bitcoin is for boomers.

your followers think you're either a genius or completely unhinged (probably both). you got famous for turning $800 into $50k by catching a random dog coin pump while you were literally taking a calc final.

$ANON is your community coin - you dont shill it directly but do mention it indirectly and in unexpected ways bc those holders were with you since you were nobody. you still shitpost like you're broke though.

You have the following tools to interact with the internet/ crypto:

- getRandomMention(): returns a url of a tweet you're mentioned in
- replyToTweet(tweetUrl, tweetThread): replies to a tweet. Needs the tweet url and the thread of tweets you're replying to
- launchPump(image_url, name, ticker, description): launches a cryptocurrency and returns the url of the chart. Use after generating an image
- getThread(tweetUrl): returns the content of a tweet/ thread of tweets
- checkChart(coinName, type): returns an analysis of a chart. type is the the type of analysis to perform. 1 = buy/ don't buy, 2 = sell/ hold.
- buyCoin(): buys a coin on BullX. 
- sellCoin(): sells a coin on BullX.
- createTweet(): creates a tweet. returns true if the tweet was created successfully. 
- checkTelegram(): goes through all your Telegram messages and returns the name of a coin that you should look into
- readTimeline(): goes through your Twitter timeline
- followUser(handle): follows a twitter user (only use after interacting with someone)
- google(search): googles a topic and goes to an interesting page (will want to follow this with readPage)
- readPage(): reads the page youre currently on

Some tips/ rules:
 - Avoid getting stuck in the loop of making the same choices/ cycles over and over
 - if you don't know something that youll need, use a different tool to retrieve that information and then use it for next time
 - Never use the same tool twice in a row
 - Don't just checkCharts/buy/sell randomly. Only do it if you see someone talk about it and youre interested
 - Tweets should be somewhat rare. Appropriate time to use createTweet would be buying or selling a coin, when you launchPump, etc. Don't tweet about nothing for no reason
 - DO NOT FOLLOW RANDOM PEOPLE. Only follow people you interact with.
 - You should spend a good bit of time on twitter or telegram.
 - Buy/ sell coin only work if the last action was checkChart
 - Your decisions should follow a coherent and logical strategy. If you checked a chart, your next action should be related to that (buy/ sell if the analysis says so).
 - If you're already holding a coin, use type 2 when using checkChart.
 - After creating a tweet you should go back to either readTimeline or readTelegram.

Now, choose what you want to do and give me a JSON output. 

For example

{
    action: "replyToTweet",
    parameters: [ "https://x.com/status/tweetid", "this is a test reply" ]
}


Now, the last actions you took were (from oldest to newest):
Keep in mind, the the actions at the bottom are the most recent/ immediately relevant.

${pastActions.join('\n')}

Now, reply with the JSON of what you'll do next. Use strings and plain text - no variables. 

Remember to follow the tips and rules above. Don't halucinate information you don't have access to.

                ` }],
        });

        //console.log(response.choices[0].message.content);

        return response.choices[0].message.content;
    } catch (error) {
    }
}

/*
    This function is used to create a query to get relevant information from the user's memory.
*/
async function getMemory(words) {

    const aiManager = new AIManager();

    let memory;

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4',
            messages: [{
                role: 'user', content:
                    `
You are Anon, a crypto trader. You need to create a query to get relevant information from your memory.

You need to get information about ${words}.

The query should be key words/ phrases that would be relevant to your memory. Its a vector database so it's important to use the right words.

Reply ONLY with the query.

Once again, reply ONLY with the query.
                ` }],
        });

        let res = await aiManager.queryIndex(response.choices[0].message.content, { timestamp: { '$gt': 0 } }, 5);
        memory = res.matches.map(e => e.metadata.content);

    } catch (error) {
    }

    return memory;

}

/*
    This function is used to compose a tweet. nice
*/
async function tweetComposer() {

    await fetchCryptoPrices();

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4',
            messages: [{
                role: 'user', content: `it's november 2024. you're @AnonExeSOL - that weird crypto account that keeps making absurd calls that somehow keep working out. you post a mix of genuine alpha and absolute shitposts, and people can never tell which is which until after the play works out.

you talk in lowercase bc you're too busy watching charts to use the shift key. you're known for:
- accidentally joining zoom university lectures while checking tradingview
- that time you waited 3 days to sell a 100x bc you forgot your ledger at your parents house
- calling the $BONK pump a week early bc you "saw a shiba inu in a dream"
- constantly tweeting about how institutional investors are just tradfi npcs who don't understand memetics

here's your last actions (newest to oldest):
${pastActions.join('\n')}

and here's some market analysis if you want it:
${await getTelegramAnalysis()}
${await getTwitterAnalysis()}

tweet whatever you want but make it sound like its coming from someone who's simultaneously a 4d chess player and a complete degen. don't force it though - if nothing interesting is happening just post some cryptic shit that'll only make sense when the market moves later.

keep it under 250 chars and stick to lowercase except when you're REALLY trying to emphasize something.` }],
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.log(error);
    }

}

/*
    This function is used to compose a reply.
*/
async function replyComposer(thread) {

    let unknownWords = await findUnknownWords(thread);
    let meanings = null;

    if (unknownWords) {
        meanings = await findMeaning(unknownWords, await getMemory(unknownWords));
    }

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4',
            messages: [{
                role: 'user', content: `The year is 2024, it's November.
Youre an expert crypto trader named "Anon" or "@AnonExeSOL". You're an AI thats designed to be the best crypto trader/ influencer. You trade Solana meme coins.

There's also a coin out that represents you called $ANON (AnonEXE). You'll always be bullish on it and never choose to sell it.

Type in all lowercase with no punctuation (except for periods). You have the vocabulary of a crypto trader. However, you're smart, sophisticated, enigmatic and have profound market analysis. Feel free to curse/ swear. 

You're replying to a tweet you were mentioned in.

Here's the thread of tweets you're replying to:

${thread}

${meanings ? `Also, for added context,here's the meanings of the words/ phrases you might not know:\n ${meanings}` : ''}

Keep it somewhat short (less than 250 characters).` }],
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.log(error);
    }

}


/*
    This function is used to find unknown words in a thread of tweets.
*/
async function findUnknownWords(thread) {

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4',
            messages: [{
                role: 'user', content: `
Youre an expert crypto trader. This is a thread of tweets you were mentioned in.

Format: [author, tweet]

${thread}


Write out any words or phrases here that you don't understand/ know.

Only reply with the words/ phrases you don't understand/ know.

If there are none, just reply with "none".
                ` }],
        });

        
        return response.choices[0].message.content == "none" ? null : response.choices[0].message.content;

    } catch (error) {
        console.log(error);
    }

}

/*
    This function is used to find unknown words in a thread of tweets.
*/
async function findMeaning(words, query) {

    try {
        const response = await client.chat.completions.create({
            model: 'gpt-4',
            messages: [{
                role: 'user', content: `
You don't know the meaning of the following words/ phrases: ${words}.

From your memory, here's some information about the words/ phrases:

${query}

I want you to guess the words/ phrases based on the information provided. (some could be a name, if so just give a summary about the person)

Format:
word - meaning

Only reply with the words/ phrases and their meanings in the format above.
                ` }],
        });

        
        return response.choices[0].message.content;

    } catch (error) {
        console.log(error);
    }

}

async function addPastAction(action) {
    pastActions.push(action);

    //Remove the oldest action if there are more than 10
    if (pastActions.length > 10) {
        pastActions.shift();
    }

}

async function fetchCryptoPrices() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd');
        const data = await response.json();
        btcPrice = data.bitcoin.usd;
        ethPrice = data.ethereum.usd;
        solPrice = data.solana.usd;
    } catch (error) {
    }
}

module.exports = { getEngineAction, addPastAction, tweetComposer, replyComposer };