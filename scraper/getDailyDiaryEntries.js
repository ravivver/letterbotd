import axios from 'axios';
import * as cheerio from 'cheerio';

export async function getDailyDiaryEntries(username, date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    const url = `https://letterboxd.com/${username}/films/diary/for/${year}/${month}/${day}/`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    const formattedDate = `${year}-${month}-${day}`; 

    try {
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        
        const diaryRows = $('tr.diary-entry-row');
        if (diaryRows.length === 0) {
            return [];
        }
        
        const dailyEntries = [];

        diaryRows.each((i, element) => {
            const row = $(element);
            
            const filmElementWithData = row.find('.film-poster[data-film-slug]').first();
            
            if (filmElementWithData.length === 0) {
                const componentFigure = row.find('div.react-component.figure[data-item-slug]').first();
                if (componentFigure.length === 0) return; 

                const slug = componentFigure.attr('data-item-slug');
                const titleWithYear = componentFigure.attr('data-item-name');
                const filmYear = componentFigure.attr('data-item-full-display-name')?.match(/\((\d{4})\)$/)?.[1] || null;
                
                let rating = null;
                const ratingRangeElement = row.find('.rateit-range[aria-valuenow]').first();
                const ratingInputField = row.find('input.rateit-field[type="range"]').first();
                
                if (ratingRangeElement.length) {
                    rating = parseInt(ratingRangeElement.attr('aria-valuenow'), 10) / 2;
                } else if (ratingInputField.length) {
                    rating = parseInt(ratingInputField.val(), 10) / 2;
                }
                
                const reviewLinkElement = row.find('td.col-review a.icon-review');
                const hasReview = reviewLinkElement.length > 0;
                const reviewUrl = hasReview ? `https://letterboxd.com${reviewLinkElement.attr('href')}` : null; 
                
                let cleanTitle = titleWithYear.replace(` (${filmYear})`, '').trim();

                dailyEntries.push({
                    slug,
                    title: cleanTitle,
                    year: filmYear || null,
                    viewing_id: row.attr('data-viewing-id'),
                    hasReview: hasReview,
                    reviewUrl: reviewUrl,
                    rating: rating,
                });
                return;
            }
            
            const slug = filmElementWithData.attr('data-film-slug');
            const title = filmElementWithData.find('img').attr('alt'); 
            let filmYear = row.find('.col-releaseyear span').text().trim() || null; 
            
            let rating = null;
            const ratingRangeElement = row.find('.rateit-range[aria-valuenow]').first();
            const ratingInputField = row.find('input.rateit-field[type="range"]').first();
            
            if (ratingRangeElement.length) {
                rating = parseInt(ratingRangeElement.attr('aria-valuenow'), 10) / 2;
            } else if (ratingInputField.length) {
                rating = parseInt(ratingInputField.val(), 10) / 2;
            }

            const reviewLinkElement = row.find('td.col-review a.icon-review');
            const hasReview = reviewLinkElement.length > 0;
            const reviewUrl = hasReview ? `https://letterboxd.com${reviewLinkElement.attr('href')}` : null; 

            let cleanTitle = title;
            if (cleanTitle) {
                cleanTitle = cleanTitle.replace('Poster for ', '').trim();
                if (filmYear && cleanTitle.endsWith(`(${filmYear})`)) {
                    cleanTitle = cleanTitle.substring(0, cleanTitle.length - `(${filmYear})`.length).trim();
                }
            }
            
            if (slug) {
                dailyEntries.push({
                    slug,
                    title: cleanTitle || title,
                    year: filmYear || null,
                    viewing_id: row.attr('data-viewing-id'),
                    hasReview: hasReview,
                    reviewUrl: reviewUrl,
                    rating: rating,
                });
            }
        });
        return dailyEntries;

    } catch (error) {
        if (error.response && error.response.status === 404) {
            return [];
        }
        console.error(`[Scraper] Error fetching diary for ${username} on ${formattedDate}:`, error.message);
        return [];
    }
}