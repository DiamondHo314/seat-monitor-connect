const readline = require('readline');
const notifier = require('node-notifier');

let accessToken = '';
let refreshToken = '';

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
    //i got the url below from the network tab in devtools while checking section details
    //from self registration page
    //note that the section id is hardcoded here, you can change it to any section you want to monitor
    //here 180322 is the section id for CSE423 section 3
    const seatStatusUrl = 'https://connect.bracu.ac.bd/api/adv/v1/advising/sections/180322/details';
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

        //console.log("details:", data);

        const course = `${data.section.courseCode} - ${data.section.name}`;
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

if(require.main === module) {
    console.log('Seat monitor started');
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

module.exports = { refreshAccessToken };