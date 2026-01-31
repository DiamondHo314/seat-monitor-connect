const readline = require('readline');
const seatmonitor = require('./seatmonitor');
const { spawn } = require('child_process');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function questionAsync(prompt) {
    return new Promise(resolve => rl.question(prompt, ans => resolve(ans)));
}

let accessToken = '';
let refreshToken = '';

function getFacultyInitials(faculties) {
    if (!faculties || faculties.trim().toUpperCase() === 'TBA') return 'TBA';
    return faculties.split(',')
        .map(name => name.trim())
        .filter(Boolean)
        .map(name => {
            const parts = name.split(/\s+/).filter(Boolean);
            const initials = parts.map(p => (p[0] && /[A-Za-z]/.test(p[0]) ? p[0].toUpperCase() : '')).join('');
            return initials || name;
        })
        .join(', ');
}

function launchMonitorInTerminal(sectionId) {
    const nodePath = process.execPath;
    const scriptPath = path.join(__dirname, 'seatmonitor.js');
    const monitorArgs = [scriptPath, '--accessToken', accessToken, '--refreshToken', refreshToken, '--sectionId', String(sectionId)];

    const terminals = [
        { cmd: 'gnome-terminal', args: ['--'] },
        { cmd: 'konsole', args: ['-e'] },
        { cmd: 'xfce4-terminal', args: ['-e'] },
        { cmd: 'mate-terminal', args: ['--'] },
        { cmd: 'lxterminal', args: ['-e'] },
        { cmd: 'xterm', args: ['-e'] }
    ];

    for (const term of terminals) {
        try {
            const child = spawn(term.cmd, [...term.args, nodePath, ...monitorArgs], { detached: true, stdio: 'ignore' });
            child.unref();
            console.log(`Launched seat monitor in new terminal using ${term.cmd}`);
            return;
        } catch (e) {
            // try next terminal
        }
    }

    // fallback: run in background without a new terminal window
    try {
        const bg = spawn(nodePath, monitorArgs, { detached: true, stdio: 'ignore' });
        bg.unref();
        console.log('Launched seat monitor in background (no terminal emulator found).');
    } catch (e) {
        console.error('Failed to launch seat monitor:', e.message);
    }
}

function formatTime24to12(timeStr) {
    // expects "HH:MM:SS" or "HH:MM"
    if (!timeStr) return '';
    const [hh, mm] = timeStr.split(':');
    let h = parseInt(hh, 10);
    const m = mm ? mm : '00';
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m}${ampm}`;
}

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
        let section = data[sectionIndex];
        let foundCourseCode = section.courseCode;
        let foundSectionNumber = section.sectionName;
        let capacity = section.capacity;
        let consumed = section.consumedSeat;
        let remaining = capacity - consumed;
        console.log(`Course: ${foundCourseCode} Section: ${foundSectionNumber} | Capacity: ${capacity} | Consumed: ${consumed} | Remaining: ${remaining}`);

        const facultyInitials = getFacultyInitials(section.faculties);
        console.log(`Faculty: ${section.faculties}`);

        // parse sectionSchedule (may be a JSON string)
        let scheduleObj = null;
        try {
            scheduleObj = typeof section.sectionSchedule === 'string' ? JSON.parse(section.sectionSchedule) : section.sectionSchedule;
        } catch (e) {
            // ignore parse error
            scheduleObj = null;
        }

        if (scheduleObj && Array.isArray(scheduleObj.classSchedules) && scheduleObj.classSchedules.length > 0) {
            console.log('Class schedules:');
            scheduleObj.classSchedules.forEach(cs => {
                const day = cs.day || cs.dayOfWeek || 'DAY';
                const start = formatTime24to12(cs.startTime);
                const end = formatTime24to12(cs.endTime);
                console.log(` - ${day}: ${start} - ${end}`);
            });
        } else {
            console.log('No class schedule details available.');
        }

        // ask user if they want to track this section
        try {
            const answer = await questionAsync('Track this section (Y/N)? ');
            const yn = (answer || '').trim().toLowerCase();
            if (yn === 'y' || yn === 'yes') {
                // determine section id field
                const sectionId = section.sectionId || section.sectionID || section.id || section.section_id || section.sectionNo || null;
                if (!sectionId) {
                    console.error('Unable to determine sectionId from data object; cannot track.');
                } else {
                    launchMonitorInTerminal(sectionId);
                }
            }
        } catch (e) {
            // ignore
        }

    } catch (err) {
        console.error('Error fetching section details:', err.message);
    }
}

console.log("You can view section details here");

async function promptForSection() {
    while (true) {
        try {
            let courseCode = (await questionAsync('Enter course code: ')).trim().toUpperCase();
            let sectionNumber = (await questionAsync('Enter section number (eg. 09, 10, 01): ')).trim();
            await checkSectionDetails(accessToken, refreshToken, courseCode, sectionNumber);
        } catch (e) {
            // if readline is closed or interrupted, exit loop
            break;
        }
    }
}

(async () => {
    accessToken = (await questionAsync('Initial access token: ')).trim();
    refreshToken = (await questionAsync('Initial refresh token: ')).trim();
    // start background token refresh
    setInterval(() => {
        seatmonitor.refreshAccessToken(refreshToken);
    }, 240000);
    // start the repeated prompt loop
    promptForSection();
})();

// the readline interface will close automatically on Ctrl+C
