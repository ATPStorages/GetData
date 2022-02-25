
const chalk = require("chalk"), 
    bcrypt = require("bcrypt"), 
    fsBase = require("fs"), 
    constants = fsBase.constants,
    fs = fsBase.promises,
    readline = require('readline/promises'), 
    tumblr = require('tumblr.js'),
    path = require("path"),
    util = require("util"),
    { get } = require("https"),
    { utimes } = require("utimes"),
    { JSDOM } = require("jsdom"),
    filename = path.basename(__filename),
    cons = require("yargs/yargs")(require('yargs/helpers').hideBin(process.argv)),
    yesreg = /^(?:1|t(?:rue)?|y(?:es)?|ok(?:ay)?)$/i,
    noreg = /^(?:0|f(?:alse)?|n(?:o)?)$/i,
    dat = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"),
    conf_skeleton = {
        "Client Key": "Enter a tumblr client key here. Don't have one? https://www.tumblr.com/oauth/apps"
    }, 
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

const args = cons
    .usage(`Usage: ${filename} <command> [options]`)
    .command('config', 'Open in configuration mode')
    .command('tagged', 'Open in Tumblr tagged mode')
    .example(`${filename}`, `Open in command selection`)
    .example(`${filename} config`, `Open in configuration mangement`)
    .example(`${filename} -p 20 -c 3 -d all -o X:\\`, `Open in command selection with tagged options preset, download to another drive`)
    .example(`${filename} -p 20 -c 3 -d images -o Data`, `Open in command selection with tagged options preset, download only images to "Data" in the executables directory`)
    .example(`${filename} -p 20 -c 3 -d text -s true`, `Open in command selection with tagged options preset, download only stripped HTML text to "Data" in the executables directory`)
    .example(`${filename} tagged -p 20 -c 1 -d all -t lol`, `Open in tagged mode and immediately start searching all posts, prompt for download location`)
    .example(`${filename} tagged -p 20 -c 1 -o Data -d image,text -t lol`, `Autonomously search types "images" and "logs" in the tag "lol" then save outputs to "Data"`)
    .alias('p', 'postcount')
    .nargs('p', 1)
    .describe('p', 'Amount of posts to collect per page.')
    .alias('c', 'pagecount')
    .nargs('c', 1)
    .describe('c', 'Amount of pages to collect.')
    .alias('d', 'types')
    .nargs('d', 1)
    .describe('d', 'Types of posts to collect. (image/text/audio/video/all/t1,t2,...)')
    .alias('t', 'tag')
    .nargs('t', 1)
    .describe('t', 'Tag to collect posts in.')
    .alias('o', 'out')
    .nargs('o', 1)
    .describe('s', 'If the "text" type option is enabled, strip HTML from collected text.')
    .alias('s', 'stripHTML')
    .nargs('s', 1)
    .describe('l', 'Collects posts *before* this Unix timestamp.')
    .alias('l', 'startTime')
    .nargs('l', 1)
    .string(["out", "tag", "types"])
    .number(["postcount", "pagecount", "startTime"])
    .boolean("stripHTML")
    .help('h')
    .alias('h', 'help')
    .recommendCommands()
    .argv;

if(args._.includes("config")) {
    config_init();
} else if(args._.includes("tagged")) {
    apikeydload();
} else {
    sel();
}

/*var fs2 = require('fs');
//var s = fs2.createReadStream(argv2.file);

var lines = 0;
s.on('data', function (buf) {
    lines += buf.toString().match(/\n/g).length;
});

s.on('end', function () {
    console.log(lines);
});*/

/*
// Tagged OAuth Authorized
console.log(chalk.yellow("Checking configuration data"));

fs.readFile(".config/pwd").then(data => {
}).catch(err => {
    if(err.message.startsWith("ENOENT")) {
        console.log(chalk.yellow("No user defined. Creating new user..."));
        pwdCreate();
    } else {
        console.error(chalk.red(`An error has occurred while trying to read your user file. (${err.message})`));
        rl.question("Would you like to create a new one? [y/n]: ", (answer) => {
            if(answer.match(yesreg) != "y") process.exit(0); else {
                pwdCreate();
            }
        });
    }
});
*/

async function sel() {
    console.log(chalk.bold("Tumblr Dataset Creator"));
    console.log(chalk.yellow(`Try the optioniated version: ${chalk.italic(chalk.white(filename, "--help"))}\n`));
    console.log(chalk.blueBright("tagged - Get a specific number of posts in a tag, and save their content(s) to a directory."));
    console.log(chalk.blueBright("config - Get/Set the current TDC configuration."));
    rl.question("What would you like to do? > ").then(async input => {
        switch(input.toLowerCase()) {
            case "tagged":
                apikeydload();
                break;
            case "config":
                config_init();
                break;
            default:
                sel();
                break;
        }

        console.clear();
    });
}

const DOMParser = (new (new JSDOM().window.DOMParser));
function stripHTML(html) {
    let doc = DOMParser.parseFromString(html, "text/html");
    return doc.body.textContent || "";
}

function formatstats(stat, stattext) {
    return (stat > 0 ? `${chalk.white(stat)} ${stattext}${stat !== 1 ? "s" : ""}` : chalk.blackBright(`0 ${stattext}s`));
}

let tabloid = new Map(), origdata = {};
async function config_init() {
    let data;
    await fs.readFile(dat + "/TDCconfig/conf").then(confj => { data = JSON.parse(confj); }).catch(async err => {
        if(err.message.startsWith("ENOENT")) {
            fs.mkdir(dat + "/TDCconfig", { recursive: true }).then(_directory => {
                fs.writeFile(dat + "/TDCconfig/conf", JSON.stringify(conf_skeleton)).then((written) => { data = JSON.parse(written); }).catch(err =>{
                    console.log(chalk.red(`Failed to create configuration file...\n└ ${err}`));
                    sel();
                });
            });
        } else {
            console.log(chalk.red(`An error has occurred while reading/transcribing the configuration file.\n└ ${err}`));
            sel();
        }
    });
    
    if(tabloid.size === 0) { origdata = data; Object.entries(data).forEach(([key, value]) => { tabloid.set(key, value); }); }
    config_mgmt(tabloid);
}

let i = 0;
async function config_mgmt(data, command, response) {
    const formatted = command ? command.toLowerCase().trim() : "";
    if(formatted.length === 0) {
        console.clear();
        if(response) console.log(`${response}\n`);
        console.log(chalk.blueBright("Configuration data"));
        Object.entries(MapToObject(data)).forEach(([key, value]) => { 
            console.log(`(${chalk.blueBright(typeof(value))}) ${chalk.yellow(key)}: ${String(value).length === 0 ? chalk.italic(chalk.blackBright("No value...")) : value}`); });
        console.log(chalk.blueBright("\nTo select/modify an item in the list, type it's name. (Case-sensitive!)\nTo exit the manager, type \"done\" | To reset modified data, type \"reset\""));
        config_mgmt(tabloid, await rl.question("Command > "));
    } else if(formatted === "done") {
        const mto = MapToObject(tabloid);
        if(deepEqual(mto, origdata)) {
            console.clear();
            console.log(chalk.yellow(`Config file data and modified data are equal. No changes were made.\n`));
            sel();
        } else {
            fs.mkdir(dat + "/TDCconfig", { recursive: true }).then(_directory => {
                fs.writeFile(dat + "/TDCconfig/conf", JSON.stringify(mto)).then(_written => {
                    tabloid.clear(); 
                    console.clear();
                    console.log(chalk.green("Successfully saved new configuration\n"));
                }).catch(err =>{
                    console.clear();
                    console.log(chalk.red(`Failed to save configuration file. Modified configuration data will be kept until program exit.\n└ ${err}\n`));
                }).finally(()=>{ sel(); })
            });
        }
    } else if(formatted === "reset") {
        tabloid.clear();
        console.clear();
        config_init();
    } else {
        let changed = false, useval;
        const value = tabloid.get(command);
        if(value !== undefined) {
            console.log(chalk.blueBright(`\nSelected item: "${chalk.white(command)}"\nValue: "${chalk.white(value)}"`));
            const res = await rl.question("What would you like to set this value to? > "),
                num = Number(res), safenum = isNaN(num) ? res : Number.isSafeInteger(num) ? Math.abs(num) : Number.MAX_SAFE_INTEGER;
            
            if(!isNaN(num)) { useval = safenum; if(safenum !== num) changed = true; } 
            else if(res.match(yesreg)) { useval = true; } 
            else if(res.match(noreg)) { useval = false; } 
            else { useval = res; };
            
            if(typeof(value) === "number" ? (value !== num) : (value !== res)) {
                tabloid.set(command, useval);
                config_mgmt(tabloid, "", changed ? chalk.yellow("Successfully updated item with changes.") : chalk.green("Successfully updated item."));
            } else {
                config_mgmt(tabloid, "", chalk.red("The value specified is already present in the item."));
            }
        } else {
            config_mgmt(tabloid, "", chalk.red("The specified item is not in the configuration table."));
        }
    }
}

function MapToObject(map) {
    let ret = {};
    for(const [key, value] of map.entries()) { ret[key] = value; }
    return ret;
}

async function apikeydload(key) {
    // Tagged API-Key
    let intkey;
    if(!key) {
        await fs.readFile(dat + "/TDCconfig/conf").then(contents => {
            const tabloid = JSON.parse(contents);
            intkey = tabloid["Client Key"];
        }).catch(async err => {
            console.log(chalk.red(`An error has occurred while trying to fetch your client key.\n└ ${err}`));
            if((await rl.question(`Would you like to enter it? > `)).match(yesreg)) {
                console.log();
                intkey = await keyCreate().catch(err => { console.log(err); process.exit(1); });;
            } else { process.exit(1); }
        });
    } else { intkey = key; }
    
    let taggedPosts;
    try {
        rl.pause();
        const client = tumblr.createClient({ consumer_key: intkey });
        const prom_getInfo = util.promisify(client.blogInfo);
        taggedPosts = util.promisify(client.taggedPosts);
        await prom_getInfo("staff.tumblr.com");
        console.log(chalk.green("Verified client key.\n"));
    } catch(err) {
        console.log(chalk.red(`An error has occurred while trying to verify your client key.\n└ ${err}`));
        if((await rl.question(`Would you like to enter it? > `)).match(yesreg)) {
            console.log();
            return keyCreate().then(key => apikeydload(key)).catch(err => { console.log(err); process.exit(1); });
        } else { process.exit(1); }
    }

    const tag = args.tag || await rl.question("What tag would you like to search? > ");
    if(!args.types) {
        console.log(chalk.blueBright("\nimage - Grabs only images from posts. " + chalk.yellow("(default)")));
        console.log(chalk.blueBright("text  - Grabs only post text, chat, quotes and answers."));
        console.log(chalk.blueBright("video - Grabs only video from posts."));
        console.log(chalk.blueBright("audio - Grabs only audio from posts."));
        console.log(chalk.blueBright("all   - Grabs all content from posts."));
        console.log(chalk.blueBright("type1,type2,type3... - Chain Types. No spaces in between the commas."));
        console.log(chalk.yellow("Files will be named based off of their URL basename. If they do not have one, it will instead be (post id).(extension)."));
    }
    
    const types = (args.types || (await rl.question("What types of posts would you like to collect? > "))).split(","),
        t_text  = types.includes("text")  || types.includes("all"),
        t_video = types.includes("video") || types.includes("videos") || types.includes("all"),
        t_audio = types.includes("audio") || types.includes("all"),
        t_image = types.includes("image") || types.includes("images") || types.includes("all");
    if(!(t_text ? (args.stripHTML || (await rl.question("Would you like to strip HTML tags from saved text? > ")).match(yesreg)) : false)) {
        stripHTML = function(html) { return html; }
    }

    if(!args.postcount) console.log(chalk.blueBright("\nThe maximum of the post limit is 20, with a minimum (and default) of 1."));
    const num = args.postcount || await rl.question("How many posts would you like to get? > ");
    let times;
    if(!args.pagecount) {
        console.log(chalk.blueBright("This option allows you to get more than just 20 posts in one go."));
        console.log(chalk.blueBright("20 posts w/ 2 times = 40 posts, 10 posts w/ 4 times = 40 posts, etc."));
        console.log();
        times = Number(await rl.question("How many times would you like to move pages? > "));
    } else { times = args.pagecount; }

    const stnum = Number(args.startTime);
    let totposts = 0, totimages = 0, totaudio = 0, totvideo = 0, tottext = 0, udaudio = 0,
        images = {"name": "images", "store": new Map()}, audio = {"name": "audio", "store": new Map()}, 
        video = {"name": "video", "store": new Map()}, text = {"name": "text", "store": new Map()}, 
        lts = isNaN(stnum) ? Date.now()+1 : stnum, errwarn = false;
    const max = isNaN(times) ? 1 : times < 1 ? 1 : times;
    const lim = isNaN(num) ? 20 : num < 1 ? 1 : num > 20 ? 20 : Number(num);

    rl.pause();
    for(let i = 0; i < max; i++) { 
        const ret = await searchLoop(taggedPosts, tag, lts, lim, { images: images, text: text, audio: audio, video: video },  {images: t_image, text: t_text, audio: t_audio, video: t_video}, i); 
        if(ret) {
            lts = ret.newTime;
            errwarn = ret.retWarn;
            images = ret.stores.images; text = ret.stores.text; audio = ret.stores.audio; video = ret.stores.video;
            totposts += ret.stats.posts; totimages += ret.stats.images; totaudio += ret.stats.audio; totvideo += ret.stats.video; tottext += ret.stats.text; udaudio += ret.stats.udaudio; 
        } else break;
    }

    console.log(chalk.blueBright(`\nGot ${chalk.white(totposts)} post(s), containing a total of ${formatstats(totimages, "image")}, ${formatstats(tottext, "log")}, ${formatstats(totvideo, "video")}, and ${formatstats(totaudio, "audio file")}! (${formatstats(totaudio + totimages + tottext + totvideo, "file")})`));
    const directory = path.resolve(args.out || await rl.question("Where would you like to save these files? > "));
    rl.pause();
   
    await fs.mkdir(directory, { recursive: true }).catch(err => {
        console.error(chalk.red(`Failed to create image save directory!\n└ ${err}`));
        process.exit(1);
    });

    console.log(chalk.green("Downloading..."));
    let dloaded = 0, size = 0, errs = 0, fmad = false, rtdir = directory;
    let promises = [];
    for (const lp of [images, video, audio, text]) {
        if (lp.store.size > 0) {
            const npath = path.join(directory, lp.name);
            await fs.mkdir(npath).then(() => {rtdir = npath}).catch(async err => {
                console.error(chalk.red(`Failed to create destination directory for "${chalk.white(lp.name)}." ${chalk.yellow("Checking if a folder already exists...")}\n└ ${err}`));
                await fs.access(npath, constants.W_OK).then(() => { 
                    console.log(chalk.green(`A directory appears to already exists for "${chalk.white(lp.name)}." It will be used for writing.`));
                    rtdir = npath;
                }).catch(aerr => { console.log(`Failed to check for an existing directory. The root directory will instead be used.\n└ ${aerr}`); rtdir = directory; });
            });
            
            for (const [link, itime] of lp.store.entries()) {
                promises.push(
                    new Promise(async(resolve, reject) => {
                        if(lp.name === "audio" && !itime) {
                            const fpath = path.join(rtdir, "audio_externalSources.log"), ap = (link + "\n");
                            fs.appendFile(fpath, ap).then(() => {
                                if(!fmad) { fmad = true; console.log(chalk.yellow(`Some audio sources were unable to be downloaded because they are on external sites. A file containing these sources has been saved to ${fpath}.`)); }
                                dloaded++;
                                size += ap.length;
                                resolve();
                            }).catch(err => {
                                errs++;
                                reject(`${chalk.bgRed(fpath)}\n${chalk.red("├")} ${chalk.redBright(`Failed to save an external audio source.\n${chalk.red("└─")} ${err}`)}`);
                            });
                        } else if(typeof(itime.text) === "undefined" || itime.text.length > 0) {
                            const file_name = path.basename(link);
                            let errstr = `${chalk.bgRed(file_name)}`;

                            const fpath = path.join(rtdir, file_name),
                                file = await fs.open(fpath, "w").catch(err => { reject(); });

                            utimes(fpath, { btime: itime.created, mtime: itime.modified, atime: Date.now() }).catch(err => 
                                { errs++; errstr += chalk.redBright(`\n${chalk.red("├")} Couldn't set creation, modification and access times.\n${chalk.red("└─")} ${err}`) });

                            if(lp.name === "text") {
                                file.writeFile(itime.text).then(() => { size += itime.text.length; dloaded++; file.close(); resolve(); }).catch(async err => {
                                    errs++;
                                    reject(errstr + chalk.redBright(`\n${chalk.red("├")} Failed while piping data.\n${chalk.red("└─")} ${err}`));
                                    await file.close();
                                    fs.unlink(fpath);
                                });
                            } else {
                                get(link, async(response)=> {
                                    if(response.statusCode === 200) {
                                        const stream = file.createWriteStream();

                                        response.on("data", data => size += data.length);
                                        response.pipe(stream).on("error", async err => {
                                            errs++;
                                            stream.destroy();
                                            await file.close();
                                            fs.unlink(fpath);
            
                                            if(err.name === "AbortError") {
                                                errstr += chalk.redBright(`\n${chalk.red("└")} Took an excessive time to pipe (x seconds).`);
                                            } else {
                                                errstr += chalk.redBright(`\n${chalk.red("├")} Failed while piping data.\n${chalk.red("└─")} ${err}`);
                                            }
            
                                            reject(errstr);
                                        }).on("finish", async() => {
                                            dloaded++;
                                            await file.close();
                                            resolve();
                                        });
                                    } else {
                                        errs++;
                                        reject(errstr + chalk.redBright(`\n${chalk.red("└")} Server returned a non-OK status code of ${response.statusCode} - ${response.statusMessage}.`));
                                    }
                                }).on("error", err => {errs++; reject(errstr + chalk.redBright(`\n${chalk.red("├")} Failed to download ${file_name}\n${chalk.red("└─")} ${err}`)); } );
                            }
                        }
                    })
                );
            }
        }
    }
        
    /*Promise.allSettled(promises).then(results => {
        if (errs > 0) {
            console.log(chalk.red("A total of ") + errs + chalk.red(" errors have happened."));
            rl.question("Would you like to view them? > ").then(response => {
                if(response.match(yesreg)) {
                    console.log();
                    for(const promise of results) {
                        if(promise.status === "rejected") {
                            console.error(promise.reason);
                        } 
                    } 
                    console.log();
                }
            });
        }

        console.log(chalk.green("All done!") + ` - ${dloaded} ` + chalk.blueBright("files downloaded with a total size of ") + `${(size/1000000).toFixed(2)} ` + chalk.blueBright("megabytes."));
    }).catch(err => {console.log(err)});*/
}

async function pwdCreate() {
    let email = await rl.question("\nEnter Tumblr Email  > ");
    let tmpwd = await rl.question("Enter Tumblr Password > ");
    console.log(chalk.yellow("Checking if this is a real account..."));
    console.log(chalk.blueBright("\nSalt rounds by default are 10. The maximum is 50, while the minimum is 0."));
    console.log(chalk.blueBright(`A higher salt round number ${chalk.italic("will slow down authentication (significantly,)")} but is more secure.`));
    let salts  = await rl.question("Enter Salt Rounds > ");
    salts = isNaN(salts) ? 10 : salts < 0 ? 0 : salts > 50 ? 50 : Number(salts);
    rl.pause();
    console.log(chalk.yellow("\nEncrypting password..."));
    console.log(await bcrypt.hash(tmpwd, salts));
    delete tmpwd;
    console.log(chalk.green(`Done!`));
    console.log(chalk.yellow(`Saving user to file...`));
    fs.mkdir(dat + "/TDCconfig", { recursive: true }).then(_directory => {
        fs.writeFile(dat + "/TDCconfig/pwd", key).then(() => { return key; }).catch(err =>{
            console.log(chalk.red(`Failed to save credentials...\n└ ${err}\n\nNo configuration will be saved. Try again.`));
            process.exit(1);
        });
    });
    console.log(chalk.green(`Saved!`));
}


function keyCreate() {
    return new Promise(async(resolve, reject) => {
        const key = (await rl.question("Enter Tumblr API Key > ")).trim();
        console.log(chalk.yellow("Verifying"));
        try {
            rl.pause();
            const cli = tumblr.createClient({ consumer_key: key });
            const prom_getInfo = util.promisify(cli.blogInfo);
            await prom_getInfo("staff.tumblr.com");

            fs.mkdir(dat + "/TDCconfig", { recursive: true }).then(_directory => {
                fs.readFile(dat + "/TDCconfig/conf").then(contents => { 
                    const tabloid = JSON.parse(contents);
                    tabloid["Client Key"] = key; 
                    fs.writeFile(dat + "/TDCconfig/conf", JSON.stringify(tabloid)).then(() => { resolve(key); });
                }).catch(err =>{
                    reject(chalk.red(`Failed to save key...\n└ ${err}\n\nNo configuration will be saved for this key.\nIf this error persists, remove the "conf" file at ${dat + "/TDCconfig"}.\n`));
                });
            });
        } catch(e) {
            console.log(chalk.red(`Verification error\n└ ${e}\n\nNo configuration will be saved for this key. Try again.\n`));
            keyCreate().then(key => resolve(key)).catch(err => { console.log(err); process.exit(1); });
        }
    });
}

function deepEqual(x, y) {
    const ok = Object.keys, tx = typeof x, ty = typeof y;
    return x && y && tx === 'object' && tx === ty ? (
        ok(x).length === ok(y).length &&
        ok(x).every(key => deepEqual(x[key], y[key]))
    ) : (x === y);
}

async function searchLoop(taggedPosts, tag, lastTimestamp, limit, stores, types, page) {
    let conf, newLTS, data = [], cstats = { images: 0, text: 0, audio: 0, video: 0, udaudio: 0, posts: 0 }, errwarn;
    await taggedPosts(tag, { before: lastTimestamp, limit: limit }).then(ret => data = ret).catch(async err => {
        console.error(chalk.red(`An error has occurred while trying to get posts in tag "${tag}"\n└ ${err}`));
        if(!errwarn) {
            console.log(chalk.blueBright("\n1 - Continue crawling"));
            console.log(chalk.blueBright("2 - Skip to downloading"));
            console.log(chalk.blueBright("3 - Halt program"));
            const intnum = Number(await rl.question("What would you like to do? > "));
            rl.pause();
            conf = isNaN(intnum) ? 3 : intnum > 3 ? 3 : intnum < 1 ? 1 : intnum
            errwarn = true;
            if(conf === 3) {
                process.exit(0);
            } else if (conf === 2) {
                conf = true;
            }
        }
    });
    
    if(conf === true) return false;
    if(data.length > 0 && data.length <= limit) {
        newLTS = data[data.length - 1].timestamp;
        cstats.posts++;

        data.forEach(info => {
            let timelet = {created: info.timestamp*1000, modified: info.blog.updated*1000};
            switch(info.type) {
                case "photo":
                    info.photos.forEach(photo => {
                        cstats.images++;
                        if(types["images"] && photo.original_size.url) { stores.images.store.set(photo.original_size.url, timelet); }
                    });

                    break;
                case "text" || "quote" || "chat" || "answer":
                    cstats.text++;
                    if(types["text"]) {
                        if(info.type === "text") {
                            timelet["text"] = stripHTML(info.body);
                            stores.text.store.set(info.id+".txt", timelet);
                        } else if(info.type === "quote") {
                            timelet["text"] = stripHTML(`${info.text}\n- ${info.source}`);
                            stores.text.store.set(info.id+".txt", timelet);
                        } else if(info.type === "chat") {
                            timelet["text"] = stripHTML(info.body);
                            stores.text.store.set(info.id+".txt", timelet);
                        } else if(info.type === "answer") {
                            timelet["text"] = stripHTML(`${info.asking_name} (${info.asking_url}): ${info.question}\n${info.blog_name } (${info.blog_url}): ${info.answer}`);
                            stores.text.store.set(info.id+".txt", timelet);
                        }
                    }

                    break;
                case "audio":
                    cstats.audio++;
                    if(types["audio"]  && info.audio_source_url) {
                        if(info.audio_type === "tumblr") {
                            stores.audio.store.set(info.audio_source_url, timelet);
                        } else {
                            cstats.udaudio++;
                            stores.audio.store.set(info.audio_source_url, undefined);
                        }
                    }

                    if(types["images"] && info.album_art) { cstats.images++; stores.images.store.set(info.album_art, timelet); }
                    break;
                case "video":
                    if(types["video"] && info.video_url) {
                        cstats.video++;
                        stores.video.store.set(info.video_url, timelet);
                    }

                    if(types["images"] && info.thumbnail_url) { cstats.images++; stores.images.store.set(info.thumbnail_url, timelet); }
                    break;
            }
        });
        
        const date = new Date((data[0].timestamp)*1000);
        const timestring = `${date.toLocaleDateString()}, ${date.toLocaleTimeString()}`
        console.log(chalk.green(`Page ${chalk.white(page+1)} (${chalk.white(`From ${timestring}`)}): Got ${chalk.white(data.length)} post(s).`));
        console.log(chalk.blueBright(`${chalk.green("└")} ${formatstats(cstats.images, "image")}, ${formatstats(cstats.text, "log")}, ${formatstats(cstats.video, "video")}, and ${formatstats(cstats.audio, "audio file")}`));
    } else {
        if(conf === 1) {
            searchLoop(taggedPosts, lastTimestamp, limit);
        } else {
            console.error(chalk.red(!errwarn ? `Couldn't get any more files on page ${page+1}! Ended search.` : `Halted search on page ${i}.`));
            if((stores.images.store.size + stores.video.store.size + stores.text.store.size + stores.audio.store.size) > 0) { return false; } else { process.exit(1); }
        }
    }

    return {stats: cstats, stores: stores, newTime: newLTS, retWarn: errwarn};
}