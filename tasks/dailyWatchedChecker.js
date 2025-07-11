// tasks/dailyWatchedChecker.js
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDailyDiaryEntries } from '../scraper/getDailyDiaryEntries.js'; // Still needed for scraping Letterboxd
import { getTmdbPosterUrl, searchMovieTMDB } from '../api/tmdb.js';
import { getUserGuilds } from '../database/db.js'; // NEW: Import getUserGuilds from db.js

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');
const sentViewingsCachePath = path.join(__dirname, '..', 'storage', 'sent_viewings_cache.json');
const guildConfigsPath = path.join(__dirname, '..', 'storage', 'guild_configs.json');

let sentDailyViewings = {}; 
let guildConfigs = {}; 

/**
 * Loads the sent viewings cache from file.
 */
async function loadSentViewingsCache() {
    try {
        const data = await fs.readFile(sentViewingsCachePath, 'utf8');
        sentDailyViewings = JSON.parse(data);
        console.log('[DailyChecker] Sent viewings cache loaded successfully.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[DailyChecker] Sent viewings cache file not found. Initializing with empty cache.');
            sentDailyViewings = {};
        } else {
            console.error('[DailyChecker] Error loading sent viewings cache:', error);
            sentDailyViewings = {}; 
        }
    }
}

/**
 * Saves the sent viewings cache to file.
 */
async function saveSentViewingsCache() {
    try {
        await fs.writeFile(sentViewingsCachePath, JSON.stringify(sentDailyViewings, null, 2), 'utf8');
        console.log('[DailyChecker] Sent viewings cache saved successfully.');
    } catch (error) {
        console.error('[DailyChecker] Error saving sent viewings cache:', error);
    }
}

/**
 * Loads guild configurations from file.
 */
async function loadGuildConfigs() {
    try {
        const data = await fs.readFile(guildConfigsPath, 'utf8');
        if (data.trim() === '') {
            console.log('[DailyChecker] Guild configurations file is empty. Initializing with empty configs.');
            guildConfigs = {};
        } else {
            guildConfigs = JSON.parse(data);
            console.log('[DailyChecker] Guild configurations loaded successfully.');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[DailyChecker] Guild configurations file not found. Initializing with empty configs.');
            guildConfigs = {};
        } else if (error instanceof SyntaxError) { 
            console.error('[DailyChecker] Error parsing guild configurations JSON (file might be empty or corrupted). Initializing with empty configs:', error.message);
            guildConfigs = {};
        } else {
            console.error('[DailyChecker] Error loading guild configurations:', error);
            guildConfigs = {}; 
        }
    }
}

/**
 * Main function to check daily watched films.
 * @param {Client} client The Discord client.
 */
export async function checkDailyWatchedFilms(client) {
    if (Object.keys(sentDailyViewings).length === 0) {
        await loadSentViewingsCache();
    }
    if (Object.keys(guildConfigs).length === 0) { 
        await loadGuildConfigs();
    }

    console.log('[DailyChecker] Starting daily watched films check...');

    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const todayFormatted = today.toISOString().split('T')[0];

    if (!sentDailyViewings[todayFormatted]) {
        sentDailyViewings[todayFormatted] = {};
    }

    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        console.error('[DailyChecker] Error reading users.json:', error);
        return;
    }

    // Structure to hold notifications grouped by guild and then by film
    // { 'guildId': { 'filmSlug': { filmDetails, users: Map<discordId, username>, reviews: [], viewingIds: Set } } }
    const notificationsByGuildAndFilm = {}; 

    // Iterate over all linked users globally
    for (const discordId in usersData) {
        let userEntry = usersData[discordId];
        if (typeof userEntry === 'string') { 
            userEntry = { letterboxd: userEntry, last_sync_date: null };
        }
        const letterboxdUsername = userEntry.letterboxd;

        if (letterboxdUsername) {
            console.log(`[DailyChecker] Verifying diary of ${letterboxdUsername} for today (${todayFormatted})...`);
            // Get all entries for this user for today (from Letterboxd scraper)
            const entries = await getDailyDiaryEntries(letterboxdUsername, today); 
            
            // For each entry, determine which guilds it should be sent to
            for (const entry of entries) {
                // If this specific viewing_id has not been sent today
                if (!sentDailyViewings[todayFormatted][entry.viewing_id]) {
                    // Find all guilds this user has logged films in
                    const userGuilds = await getUserGuilds(discordId); // Get guilds from DB
                    
                    for (const userGuildId of userGuilds) {
                        // Check if the bot is actually in this guild and if a channel is configured
                        const guild = client.guilds.cache.get(userGuildId);
                        const notificationChannelId = guildConfigs[userGuildId]?.notification_channel_id;

                        if (guild && notificationChannelId) {
                            const channel = guild.channels.cache.get(notificationChannelId);
                            if (channel && channel instanceof TextChannel) {
                                // Prepare notification for this specific guild and film
                                if (!notificationsByGuildAndFilm[userGuildId]) {
                                    notificationsByGuildAndFilm[userGuildId] = {};
                                }
                                const groupKey = entry.slug; // Group by film slug

                                if (!notificationsByGuildAndFilm[userGuildId][groupKey]) {
                                    notificationsByGuildAndFilm[userGuildId][groupKey] = {
                                        title: entry.title,
                                        slug: entry.slug,
                                        year: entry.year,
                                        viewingIds: new Set(),
                                        users: new Map(), // Map to store {discordId: username}
                                        reviews: [],
                                        posterUrl: null,
                                    };
                                }

                                const filmGroup = notificationsByGuildAndFilm[userGuildId][groupKey];
                                filmGroup.viewingIds.add(entry.viewing_id);
                                // Store Discord ID and Letterboxd username
                                filmGroup.users.set(discordId, letterboxdUsername); 

                                if (entry.hasReview) {
                                    // Store Discord ID and review URL for review
                                    // CORRECTED: Check if a review for THIS discordId already exists in the group
                                    const existingReviewForUser = filmGroup.reviews.find(r => r.discordId === discordId); 
                                    if (!existingReviewForUser) { // If no review for this user yet, add it
                                        filmGroup.reviews.push({
                                            discordId: discordId, // Store Discord ID for review
                                            username: letterboxdUsername, // Store Letterboxd username for review
                                            reviewUrl: entry.reviewUrl,
                                        });
                                    }
                                }
                            } else {
                                console.warn(`[DailyChecker] Configured channel ${notificationChannelId} for guild ${userGuildId} not found or not a text channel. Cannot send notification.`);
                            }
                        } else {
                            console.log(`[DailyChecker] Bot not in guild ${userGuildId} or no channel set for it. Cannot send notification.`);
                        }
                    }
                    // Mark this viewing_id as sent for today, so it's not processed again in this run or future runs today
                    sentDailyViewings[todayFormatted][entry.viewing_id] = true; 
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay per user scraped
    }

    // Now, send the prepared notifications for each guild
    for (const guildId in notificationsByGuildAndFilm) {
        const guildNotifications = notificationsByGuildAndFilm[guildId];
        const guild = client.guilds.cache.get(guildId);
        const notificationChannelId = guildConfigs[guildId]?.notification_channel_id;

        if (!guild || !notificationChannelId) {
            console.error(`[DailyChecker] Guild ${guildId} or its channel config missing during send phase. Skipping.`);
            continue;
        }
        const channel = guild.channels.cache.get(notificationChannelId);
        if (!channel || !(channel instanceof TextChannel)) {
            console.error(`[DailyChecker] Channel ${notificationChannelId} in guild ${guildId} is invalid. Skipping.`);
            continue;
        }

        for (const filmSlug in guildNotifications) {
            const group = guildNotifications[filmSlug];

            // Fetch poster once per film group
            let movieData = null;
            try {
                movieData = await searchMovieTMDB(group.title, group.year);
                group.posterUrl = movieData ? getTmdbPosterUrl(movieData.poster_path) : null;
            } catch (error) {
                console.error(`[DailyChecker] Error fetching poster for ${group.title}:`, error.message);
            }

            // Correctly get user mentions and Letterboxd usernames
            const userMentions = Array.from(group.users.keys()).map(discordId => `<@${discordId}>`).join(', ');
            const letterboxdUsernames = Array.from(group.users.values()).join(', '); 
            const filmTitleWithYear = `${group.title} (${group.year || 'Unknown Year'})`;

            // REMOVED EMOJI FROM DESCRIPTION, REMOVED "today"
            let description = `${userMentions} logged [${filmTitleWithYear}](https://letterboxd.com/film/${group.slug}/)`;

            if (group.reviews.length > 0) {
                const reviewLinks = group.reviews.map(review => {
                    // CORRECTED: Link to Letterboxd review URL, text is username
                    return `[${review.username}](${review.reviewUrl})`; 
                }).join(', ');
                // REMOVED "review" from text, kept "Review:"
                description += `\n\nReview: ${reviewLinks}`; 
            }

            const embed = new EmbedBuilder()
                .setColor(0x6f52e3) 
                // CORRECTED: Title with popcorn emoji and without "Today"
                .setTitle(`🍿 Watched Today`) 
                .setDescription(description)
                .setThumbnail(group.posterUrl)
                // REMOVED: setTimestamp() to remove footer time
                // .setTimestamp(); 

            try {
                await channel.send({ embeds: [embed] });
                console.log(`[DailyChecker] Sent embed for ${filmTitleWithYear} watched by ${letterboxdUsernames} in guild ${guild.id}.`);
            } catch (error) {
                console.error(`[DailyChecker] Error sending embed to channel ${channel.id} in guild ${guild.id}:`, error.message);
            }
            await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between embeds
        }
    }
    console.log('[DailyChecker] Daily watched films check completed.');
    await saveSentViewingsCache(); 
}

// Clear the sent viewings cache at the start of a new day
setInterval(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayFormatted = today.toISOString().split('T')[0];
    if (!sentDailyViewings[todayFormatted] && Object.keys(sentDailyViewings).length > 0) {
        console.log('[DailyChecker] New day detected. Clearing sent viewings cache.');
        for (const key in sentDailyViewings) {
            delete sentDailyViewings[key];
        }
        saveSentViewingsCache(); 
    }
}, 60 * 60 * 1000); // Every hour
