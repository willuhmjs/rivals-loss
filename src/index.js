require('dotenv').config();
const { Builder, Browser, By, Key, until } = require('selenium-webdriver');
const fs = require("fs");
const https = require('https');
const firefox = require('selenium-webdriver/firefox'); 

const options = new firefox.Options(); 

const getStats = (user) => {
    const filePath = `${user}.txt`;
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '0,0'); // Initialize with 0 losses and 0 wins
    }
    const [losses, wins] = fs.readFileSync(filePath, "utf-8").split(',').map(Number);
    return { losses, wins };
}

const setStats = (user, losses, wins) => {
    fs.writeFileSync(`${user}.txt`, `${losses},${wins}`);
}

const sendDiscordMessage = async (user, message, won) => {
    const webhookUrl = process.env.DISCORD;
    const data = JSON.stringify({
        embeds: [{
            title: `${user} ${won ? 'won' : 'lost'} a game!`,
            description: message,
            color: won ? 3066993 : 15158332 // Green for wins, Red for losses
        }]
    });

    const url = new URL(webhookUrl);
    const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        res.on('data', (d) => {
            process.stdout.write(d);
        });
    });

    req.on('error', (e) => {
        console.error(e);
    });

    req.write(data);
    req.end();
}

const scanForStats = async (user) => {
    let driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options.addArguments("--headless=true")).build();
    try {
        await driver.get(`https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${user}?`)
        let body = await driver.executeScript('return document.body.innerText')
        const { data } = JSON.parse(body)
        const totalMatches = data.segments.find(segment => segment.type === "overview").stats.matchesPlayed.value;
        const totalWins = data.segments.find(segment => segment.type === "overview").stats.matchesWon.value;
        const newLosses = totalMatches - totalWins;

        const { losses: currentLosses, wins: currentWins } = getStats(user);
        if (newLosses > currentLosses || totalWins > currentWins) {
            setStats(user, newLosses, totalWins);
            return { updated: true, newLosses, oldLosses: currentLosses, newWins: totalWins, oldWins: currentWins };
        } else {
            return { updated: false, newLosses, oldLosses: currentLosses, newWins: totalWins, oldWins: currentWins };
        }

    } finally {
        await driver.quit()
    }
}

const scan = async (user) => {
    const { updated, newLosses, oldLosses, newWins, oldWins } = await scanForStats(user);
    if (updated) {
        console.log(`Losses: ${newLosses}. Wins: ${newWins}.`);
        if (newLosses > oldLosses) {
            await sendDiscordMessage(user, `${user} has recently lost ${newLosses - oldLosses} game${(newLosses - oldLosses) === 1 ? "" : "s"}! He now has ${newLosses} losses on Marvel Rivals.`, false);
        }
        if (newWins > oldWins) {
            await sendDiscordMessage(user, `${user} has recently won ${newWins - oldWins} game${(newWins - oldWins) === 1 ? "" : "s"}! He now has ${newWins} wins on Marvel Rivals.`, true);
        }
    } else {
        console.log("No updates");
    }
}

const users = ['bigewoo', 'HelloRobot', 'willuhmjs', "Ultran1te"]; // Add your list of users here

const scanAllUsers = async () => {
    for (const user of users) {
        await scan(user);
    }
}

const startScanning = () => {
    scanAllUsers();
    setInterval(scanAllUsers, 5 * 60 * 1000); // 5 minutes interval
}

startScanning();

