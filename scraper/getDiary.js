import axios from 'axios';
import * as cheerio from 'cheerio';

async function getRecentDiaryEntries(username) { 
    if (!username) {
        throw new Error('Letterboxd username is required.');
    }

    const url = `https://letterboxd.com/${username}/films/diary/`;
    const films = [];
    let currentMonth = '';
    let currentYear = '';

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 300 || status === 404; 
            },
        });

        const $ = cheerio.load(response.data);

        const pageTitle = $('title').text();
        const mainContent = $('#content').text(); 

        if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) { 
            throw new Error('Letterboxd user not found.');
        }
        
        if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
             throw new Error('Letterboxd profile is private. Cannot access diary.');
        }

        if (response.status === 404) {
             throw new Error('The Letterboxd page returned an unexpected 404 error.');
        }

        $('.diary-entry-row').each((i, element) => {
            const entry = $(element);

            const monthElementInFlag = entry.find('.td-calendar .date strong a');
            const yearElementInFlag = entry.find('.td-calendar .date small');

            if (monthElementInFlag.length && yearElementInFlag.length) {
                currentMonth = monthElementInFlag.text().trim();
                currentYear = yearElementInFlag.text().trim();
            } else if (monthElementInFlag.length && !yearElementInFlag.length) {
                currentMonth = monthElementInFlag.text().trim();
                if (!currentYear) { 
                    const urlPath = monthElementInFlag.attr('href');
                    const yearMatch = urlPath ? urlPath.match(/\/(\d{4})\/$/) : null;
                    if (yearMatch) currentYear = yearMatch[1];
                    else currentYear = String(new Date().getFullYear()); 
                }
            } else if (!currentMonth || !currentYear) { 
                 const fullDateAttr = entry.find('time.timestamp').attr('datetime'); 
                 if (fullDateAttr) {
                    const d = new Date(fullDateAttr);
                    currentYear = String(d.getFullYear());
                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    currentMonth = monthNames[d.getMonth()];
                 }
            }
            
            const filmTitle = entry.find('h2.name.prettify a').text().trim();
            const filmYearText = entry.find('.releasedate a').text().trim();
            const filmYear = filmYearText ? parseInt(filmYearText) : null;

            const dayNumber = entry.find('.td-day a').text().trim();
            const watchedDateText = `${currentMonth} ${dayNumber}`.trim(); 
            const loggedYear = currentYear ? parseInt(currentYear) : null;

            let watchedDateFull = null;
            if (currentMonth && dayNumber && loggedYear) {
                const monthMap = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 
                                   'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12' }; 
                const monthNum = monthMap[currentMonth];
                if (monthNum) {
                    watchedDateFull = `${loggedYear}-${monthNum}-${dayNumber.padStart(2, '0')}`;
                }
            }
            
            const ratingInput = entry.find('.td-rating input.rateit-field');
            let rating = null;
            if (ratingInput.length) {
                const dataRating = parseInt(ratingInput.val());
                if (!isNaN(dataRating)) {
                    rating = dataRating / 2;
                }
            } else { 
                const ratingValueElement = entry.find('.td-rating .rateit-range');
                if (ratingValueElement.length) {
                    const dataRating = parseInt(ratingValueElement.attr('aria-valuenow'));
                    if (!isNaN(dataRating)) {
                        rating = dataRating / 2;
                    }
                }
            }
            
            const filmLinkElement = entry.find('h2.name.prettify a');
            const filmUrl = `https://letterboxd.com` + filmLinkElement.attr('href');
            const filmSlugMatch = filmUrl.match(/\/film\/([a-zA-Z0-9-]+)\//);
            const filmSlug = filmSlugMatch ? filmSlugMatch[1] : null;

            films.push({
                username: username,
                title: filmTitle,
                year: filmYear,
                url: filmUrl, 
                watchedDate: watchedDateText,
                watchedDateFull: watchedDateFull, 
                loggedYear: loggedYear,
                rating: rating,
                filmSlug: filmSlug 
            });
        });

        if (films.length === 0) {
            console.log(`Debug: No diary entries found for "${username}".`);
        }

        return films;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Could not connect to Letterboxd. Check your internet connection.');
        }
        if (error.message.includes('Error accessing this user\'s Letterboxd.')) {
            throw error; 
        }
        console.error(`Unexpected error scraping user diary for ${username}:`, error.message);
        throw new Error(`An unexpected error occurred while fetching ${username}'s diary. Please try again later. Details: ${error.message}`);
    }
}

export default getRecentDiaryEntries;