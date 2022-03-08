// Twitter Post Collector v1.0 //
import TwitterApiv2ReadOnly from "twitter-api-v2/dist/v2/client.v2.read";
import TwitterApi, { TweetSearchAllV2Paginator, Tweetv2SearchParams } from "twitter-api-v2";
type authTable   = { client_key?: string, client_secret?: string, bearer_token?: string};

type  postOptions = { pages: number, iterate?: boolean, searchOptions?: Tweetv2SearchParams }
const postDefault = { pages: 1, iterate: false }

// Authentication
function authenticate(token: string): TwitterApiv2ReadOnly
function authenticate(key: string, secret: string): TwitterApiv2ReadOnly
function authenticate(authentication: authTable | TwitterApiv2ReadOnly): TwitterApiv2ReadOnly

/**
 * Returns a read-only Twitter API object.
 * Used for most methods this module provides.
 * @param {string} token
 * @param {string} key
 * @param {string} secret
 * @param {authTable | TwitterApiv2ReadOnly} authentication
 * @returns {TwitterApiv2ReadOnly}
 */
function authenticate(key: any, secret?: string): TwitterApiv2ReadOnly { 
    if(key.constructor.name === "TwitterApiv2ReadOnly") {
        return key;
    } else {
        switch(typeof(key)) {
            case "string":
                if(key && secret) { return new TwitterApi({ appKey: key, appSecret: secret }).readOnly.v2; } 
                else if(key && !secret) { return new TwitterApi(key).readOnly.v2; }
            case "object":
                if(key.client_secret && key.client_key) { return new TwitterApi({ appKey: key.client_key, appSecret: key.client_secret }).readOnly.v2; } 
                else if(key.bearer_token) { return new TwitterApi(key.bearer_token).readOnly.v2; }
        }
    
        throw new RangeError("Provided authentication values were not valid.");
    }
}

// Post collection

/**
 * Returns an object containing stores of what collected Tweets had such as text, images, audio, and video, or a Tweet paginator if the iterate option is set to true in options.
 * Only for recent (within the last week) posts.
 * @param {string} query
 * @param {authTable | TwitterApiv2ReadOnly} authentication
 * @param {postOptions} [options=postDefault]
 * @returns {TweetSearchAllV2Paginator | {}}
 */
function collectPostsRecent(query: string, authentication: authTable | TwitterApiv2ReadOnly, options: postOptions=postDefault): Promise<TweetSearchAllV2Paginator | {}> {
    const session = authenticate(authentication);
    return new Promise((resolve, reject) => {
        const paginator = session.search(query)
        
    });
}

module.exports.authenticate = authenticate;
module.exports.collectPosts = collectPostsRecent;