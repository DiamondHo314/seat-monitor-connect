const readline = require('readline');
const seatmonitor = require('./seatmonitor');

let accessToken = '';
let refreshToken = '';

async function checkSectionDetails(accessToken, refreshToken, courseCode, sectionNumber) {
    const schedulesURL = "https://connect.bracu.ac.bd/api/adv/v1/advising/sections/student/18760/schedules";
    try {
        const res = await fetch(schedulesURL, {
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
            "referrer": "https://connect.bracu.ac.bd/student/advising/section-status",
            "method": "GET",
            "mode": "cors"
        });
        const data = await res.json();
        console.log("Searching for course:", courseCode, "section:", sectionNumber);
        let sectionIndex = data.findIndex(section => section.courseCode === courseCode && section.sectionName == (sectionNumber));
        if (sectionIndex === -1) {
            console.log("Section not found.");
            return;
        }
        let foundCourseCode = data[sectionIndex].courseCode;
        let foundSectionNumber = data[sectionIndex].sectionName;
        let capacity = data[sectionIndex].capacity;
        let consumed = data[sectionIndex].consumedSeat;
        let remaining = capacity - consumed;
        console.log(`Course: ${foundCourseCode} Section: ${foundSectionNumber} | Capacity: ${capacity} | Consumed: ${consumed} | Remaining: ${remaining}`);
    } catch (err) {
        console.error('Error fetching section details:', err.message);
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("You can view section details here");

function promptForSection() {
    rl.question('Enter course code: ', (courseCode) => {
        courseCode = courseCode.trim().toUpperCase();
        rl.question('Enter section number (eg. 09, 10, 01): ', (sectionNumber) => {
            sectionNumber = sectionNumber.trim();
            checkSectionDetails(accessToken, refreshToken, courseCode, sectionNumber)
                .finally(() => {
                    promptForSection();
                });
        });
    });
}

rl.question('Initial access token: ', (token) => {
    accessToken = token;
    rl.question('Initial refresh token: ', (rToken) => {
        refreshToken = rToken;
        // Start background token refresh
        setInterval(() => {
            seatmonitor.refreshAccessToken(refreshToken);
        }, 240000);
        // Start the repeated prompt loop
        promptForSection();
    });
});

//the readline interface will close automatically on Ctrl+C 
