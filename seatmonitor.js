const readline = require('readline');
const notifier = require('node-notifier');


//this only runs for 30 mins only due to token expiry
//idk how to make it run longer
let accessToken = '';
let refreshToken = '';
let monitoredSectionId = null;

function parseCliArgs() {
    const args = process.argv.slice(2);
    const out = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a) continue;
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const val = args[i + 1];
            out[key] = val;
            i++;
        }
    }
    return out;
}

const cli = parseCliArgs();
if (cli.accessToken) accessToken = cli.accessToken;
if (cli.refreshToken) refreshToken = cli.refreshToken;
if (cli.sectionId) monitoredSectionId = cli.sectionId;

async function refreshAccessToken(refreshToken) {
    const refreshUrl = 'https://sso.bracu.ac.bd/realms/bracu/protocol/openid-connect/token';
    try {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('refresh_token', refreshToken);
        formData.append('client_id', 'slm'); 
        const res = await fetch(refreshUrl, {
            "credentials": "include",
            "headers": {
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.5",
                "Content-type": "application/x-www-form-urlencoded",
                "Alt-Used": "sso.bracu.ac.bd",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-site"
            },
            "referrer": "https://connect.bracu.ac.bd/",
            "body": `${formData.toString()}`,
            "method": "POST",
            "mode": "cors"
        }); 

        if (!res.ok) {
            console.error(`Token refresh failed: ${res.status}`);
            return "failed"; 
        }

        const data = await res.json();
        //console.log('Token refresh response:', data);
        accessToken = data.access_token;
        refreshToken = data.refresh_token  // sometimes refresh_token is rotated
        console.log('Access token refreshed at', new Date().toLocaleTimeString());
        //console.log('New access token:', accessToken);
    } catch (err) {
      console.error('Failed to refresh token:', err.message);
    }
}

async function checkSeats(accessToken, refreshToken) {
    // build URL for the monitored section id; fall back to a placeholder if none provided
    // 183945 is the section id for cse437 in spring 2026

    const sectionToUse = monitoredSectionId || '183945';
    const seatStatusUrl = `https://connect.bracu.ac.bd/api/adv/v1/advising/sections/${sectionToUse}/details`;
    try {
        const res = await fetch(seatStatusUrl, {
            "credentials": "include",
            "headers": {
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.5",
                "X-REALM": "bracu",
                "Authorization": `Bearer ${accessToken}`,
                "Alt-Used": "connect.bracu.ac.bd",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin"
            },
            "referrer": "https://connect.bracu.ac.bd/student/advising/self-registration",
            "method": "GET",
            "mode": "cors"
            });

        if (res.status === 401) {
            console.log('Access token expired, will refresh soon...');
            return
        }

        const data = await res.json();
        const capacity = data.section.capacity;
        const consumed = data.section.consumedSeat;
        const remaining = capacity - consumed;

                // include section number (sectionNum) along with course code and title
                const sectionNum = data.section.sectionName || data.section.sectionNo || '';
                const course = `${data.section.courseCode} SEC${sectionNum} - ${data.section.name}`;
                console.log(`[${new Date().toLocaleTimeString()}] ${course}: ${remaining} seat(s) remaining`);

                if (remaining > 0) {
                    console.log('Seat available! Go register now!');
                    notifier.notify({
                            title: 'Seat Available',
                            message: `Seats available in ${course}: ${remaining}`,
                            sound: true
                    });
                }
    } catch (err) {
      console.error('Error checking seats:', err.message);
    }
}

if (require.main === module) {
    console.log('Seat monitor started');
    // if CLI args were provided, start non-interactive monitoring
    if (accessToken && refreshToken && monitoredSectionId) {
        console.log(`Monitoring section ${monitoredSectionId}`);
        // initial check
        checkSeats(accessToken, refreshToken);
        setInterval(() => checkSeats(accessToken, refreshToken), 15000);
        setInterval(() => refreshAccessToken(refreshToken), 240000);
    } else {
        console.log("enter your initial access token:");
        const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
        rl.question('initial access token: ', (token) => {
            accessToken = token;
            rl.question('initial refresh token: ', (rToken) => {
                refreshToken = rToken;
                rl.close();

                //initial check
                checkSeats(accessToken, refreshToken);
                setInterval(() => {
                    checkSeats(accessToken, refreshToken);
                }, 15000); //checks every 15 seconds
            });
            setInterval(() => {
                refreshAccessToken(refreshToken);
            }, 240000); //refreshes every 4 minutes
        });
    }
}

module.exports = { refreshAccessToken };