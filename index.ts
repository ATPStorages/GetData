import * as fs from "fs/promises"
import isEqual from "is-objects-equal";

import { spawn } from "child_process";
import { request } from "https";
import { prompt } from "inquirer";
import { join, basename } from "path";
import { compare } from "compare-versions";
import { version, bugs } from "./package.json";
import { yellow, green, blueBright, white, red, redBright } from "chalk";
/// /// /// /// /// /// /// /// /// /// /// /// ///
const
    userData = join(
        process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"), 
        "AdenosineTriphosphate", 
        "GetData"
    ),

    dataSkeleton = {
        "tumblr client key": ""
    };
/// /// /// /// /// /// /// /// /// /// /// /// ///
printLine(yellow("Checking for updates"));
try {
    request({ hostname: "api.github.com", path: "/repos/ATPStorages/GetData/releases/latest" })
        .setHeader("User-Agent", `GetData/${version}`)
        .setHeader("Content-Type", "application/json")
    .end().on("response", (res) => {
        if(res.statusCode === 200) {
            let data = "";
            res.on("data", (buffer: Buffer) => {
                data += buffer.toString();
            }).on("error", (err) => {
                throw err;
            }).on("end", () => {
                const latest = JSON.parse(data);

                console.clear();
                if(compare(latest.name, version, ">")) {
                    printLine(green(`An update is available! ${white(version)} -> ${white(latest.name)}\n`));
                    prompt([ { type: "confirm", default: true, name: "update", message: "Would you like to install this update?" } ]).then(async ans => {
                        if(ans.update === true) { 
                            for(const asset of latest.assets) {
                                if(asset.name.startsWith("getdata-"+process.platform)) {
                                    return update(asset.browser_download_url, asset.size, join(__dirname, "new_" + basename(asset.browser_download_url)));
                                }
                            }
                
                            console.error(red(`Your platform's (${process.platform}) package wasn't found. Please raise an issue at ${white(bugs.url)}.\n`));
                        }
                    }).catch(inquirerError);
                } else {
                    printLine(green(`You are up-to-date. (${white("GetData " + version)})\n`));
                }

                main();
            });
        } else {
            throw new Error(`GitHub returned a non-OK status of ${res.statusCode} - ${res.statusMessage}`);
        }
    }).on("error", (err) => { throw err; });
} catch(err) {
    console.error(redBright(`\nAn error has occurred while trying to check for updates.\n-> ${err}`));
}
/// /// /// /// /// /// /// /// /// /// /// /// ///
let befData = {};
async function main(saveData?: string) {
    printLine(yellow("Checking for configuration data"));
    const confpath = join(userData, "config");
    let data = {}, awaitcall = true, modified = false;
    await fs.readFile(confpath).then(async (buffer: Buffer) => data = JSON.parse(buffer.toString()));

    if(saveData) {
        const parsed = JSON.parse(saveData);
        if(!isEqual([data, parsed])) {
            await fs.writeFile(confpath, saveData).then(() => { data = parsed; modified = true; }).catch((err: Error) => {
                console.error(red(`\nFailed to write passed configuration data.\n=> Data: ${saveData}\n=> ${err}`));
                process.exit(1);
            });
        }
    } else {
        await fs.open(confpath, "r+").then(async (handle: fs.FileHandle) => {
            await handle.readFile().then((ret: Buffer) => { data = JSON.parse(ret.toString()); });
            handle.close();
        }).catch(async err => {
            if(err.message.startsWith("ENOENT")) { printLine(redBright(`There is no configuration file.\n`)); } 
            else { console.error(redBright(`\nAn error has occurred while trying to open the configuration file.\n-> ${err}`)); }

            await prompt([ { type: "confirm", default: true, name: "create", message: "Would you like to create a new one?" } ]).then(async ans => {
                if(ans.create === true) { 
                    await fs.mkdir(userData, { recursive: true }).then(async () => {
                        await fs.open(confpath, "w+").then(async handle => { 
                            await handle.write(JSON.stringify(dataSkeleton)).then(ret => data = JSON.parse(ret.buffer)).catch(err => {
                                console.error(red(`Failed to write skeleton data to configuration file.\n=> ${err}`)); 
                                process.exit(1); 
                            });

                            handle.close();
                        }).catch(err => { 
                            console.error(red(`Failed to create a new configuration file.\n=> ${err}`)); 
                            process.exit(1); 
                        });
                    }).catch(err => {
                        console.error(red(`Failed to create data directory.\n=> ${err}`));
                        process.exit(1);
                    }).finally(() => { awaitcall = false; });
                }
            }).catch(inquirerError);
        });
    }

    Object.assign(befData, data);

    if(awaitcall) {
        printLine(green(modified ? "Configuration saved" : "Configuration loaded") + "\n");
        prompt([ { type: "list", name: "command", message: "What would you like to do?", choices: [ "Modify configuration", "Download files" ] } ]).then(ans => {
            switch(ans.command) {
                case "Modify configuration":
                    configEditor(data);
                    break;
                case "Download files":
                    // Not implemented
                    break;
            }
        }).catch(inquirerError);
    } else {
        configEditor(data);
    }
}  

function update(link: string, size: number, fpath: string) {
    fs.open(fpath, "w+").then(handle => {
        const stream = handle.createWriteStream();
        console.log(blueBright(`Downloading - ${white(link)}`));
        printLine(blueBright(`${white(0)}% - ${white(0)} bytes downloaded / ${white(0)} bytes written / ${white(size)} bytes total`));
        request({ hostname: "api.github.com", path: "/repos/ATPStorages/GetData/releases/latest" })
            .setHeader("User-Agent", `GetData/${version}`)
            .setHeader("Content-Type", "application/json")
        .end().on("response", (res) => {
            let downloadedBytes = 0;
            res.on("data", (chunk) => {
                downloadedBytes += chunk.length;
                printLine(blueBright(`${white(Math.floor((downloadedBytes/size*100)))}% - ${white(downloadedBytes)} bytes downloaded / ${white(stream.bytesWritten)} bytes written / ${white(size)} bytes total`));
            });
            
            res.pipe(stream, {end: false}).on("unpipe", () => {
                stream.close(async err => {
                    handle.close();
                    printLine(green("All done! - Starting updated version\n"));
                    spawn(fpath, [], { detached: true, shell: true, stdio: "ignore" }).on("error", (err: Error) => {
                        console.error(red(`Failed to start...\n-> ${err}`));
                        process.exit(1);
                    }).unref();

                    process.exit(0);
                });
            });
        }).on("error", (err) => {
            console.error(red(`Failed to download update.\n-> ${err}`));
            main();
        });
    }).catch(err => {
        console.error(red(`Failed to open a handle for the new version.\n-> ${err}`));
        main();
    });
}

function configEditor(data: any, sel?: string, message?: string) {
    console.clear();
    if(message) console.log(message);
    console.log(blueBright`GetData configuration editor`);
    if(sel) {
        const titleCase = toTitleCase(sel);
        console.log(blueBright`Selected item: {white {italic ${titleCase}}}`);
        prompt([ { type: "input", name: "value", message: "What would you like to set this to?" } ]).then(ans => {
            const old = data[sel];
            if(old === ans.value) {
                configEditor(data, undefined, yellow`Didn't change {white ${titleCase}}; original and changed values were the same.`);
            } else {
                data[sel] = ans.value;
                configEditor(data, undefined, green`Changed {white ${titleCase}}: ("{white ${truncate(old, 25)}}" -> "{white ${truncate(ans.value, 25)}}")`);
            }
        }).catch(inquirerError);
    } else {
        for(const [key, value] of Object.entries(data)) console.log(yellow`${toTitleCase(key)}{white : ${truncate(value, 50)}}`);
        console.log(blueBright`\nType {white a key's name} (not case-sensitive) to select and modify it.\nType {white done} to save changes and exit.\nType {white reset} to undo changes.\nType {white freset} to reset the file to it's factory state.`);
        prompt([ { type: "input", name: "key", message: "What would you like to change?" } ]).then(ans => {
            const lowered = ans.key.toLowerCase();
            switch(lowered) {
                case "done":
                    console.clear();
                    main(JSON.stringify(data));
                    break;
                case "reset":
                    configEditor(befData);
                    break;
                case "freset":
                    configEditor(dataSkeleton);
                    break;
                case "":
                    configEditor(data);
                    break;
                default:
                    if(data[lowered] != undefined) { configEditor(data, lowered); } 
                    else { configEditor(data, undefined, redBright(`"${truncate(lowered, 20)}" isn't in the configuration file.`)); }
                    break;
            }
        }).catch(inquirerError);
    }
}

function printLine(text: string) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(text);
}

function inquirerError(err: any) {
    if(err.isTtyError) { console.error(red("Please run this program in a terminal.")); process.exit(1); }
    else { throw new Error(err); }
}

function truncate(text: any, length: number) {
    if(text.length > length) { return text.substring(0, length-1) + "…"} 
    else { return text }
}

function toTitleCase(text: string) {
    return text.toLowerCase().split(' ').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');
}