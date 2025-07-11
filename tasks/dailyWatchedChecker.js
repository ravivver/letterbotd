// tasks/dailyWatchedChecker.js
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDailyDiaryEntries } from '../scraper/getDailyDiaryEntries.js';
import { getTmdbPosterUrl, searchMovieTMDB } from '../api/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');
const sentViewingsCachePath = path.join(__dirname, '..', 'storage', 'sent_viewings_cache.json');
const guildConfigsPath = path.join(__dirname, '..', 'storage', 'guild_configs.json'); // Path for guild configs

let sentDailyViewings = {}; 
let guildConfigs = {}; // Cache for guild configurations

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
        // NEW: Check if data is empty before parsing, or catch SyntaxError
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
        } else if (error instanceof SyntaxError) { // NEW: Catch JSON parsing errors
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
    // Load caches on first execution or bot restart
    if (Object.keys(sentDailyViewings).length === 0) {
        await loadSentViewingsCache();
    }
    if (Object.keys(guildConfigs).length === 0) { // Load guild configs if empty
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

    const guilds = client.guilds.cache.values(); 
    for (const guild of guilds) {
        console.log(`[DailyChecker] Processing guild: ${guild.name} (${guild.id})`);

        const notificationChannelId = guildConfigs[guild.id]?.notification_channel_id;
        if (!notificationChannelId) {
            console.log(`[DailyChecker] No notification channel set for guild ${guild.name}. Skipping.`);
            continue; 
        }

        const channel = guild.channels.cache.get(notificationChannelId);
        if (!channel || !(channel instanceof TextChannel)) {
            console.error(`[DailyChecker] Configured channel ${notificationChannelId} for guild ${guild.name} not found or not a text channel. Skipping.`);
            continue;
        }

        const allUsersEntriesTodayInGuild = []; 

        for (const discordId in usersData) {
            let userEntry = usersData[discordId];
            if (typeof userEntry === 'string') { 
                userEntry = { letterboxd: userEntry, last_sync_date: null };
            }
            const letterboxdUsername = userEntry.letterboxd;

            if (letterboxdUsername) {
                console.log(`[DailyChecker] Verifying diary of ${letterboxdUsername} for today (${todayFormatted}) in guild ${guild.id}...`);
                const entries = await getDailyDiaryEntries(letterboxdUsername, today);
                
                entries.forEach(entry => {
                    allUsersEntriesTodayInGuild.push({
                        ...entry,
                        discordId: discordId,
                        letterboxdUsername: letterboxdUsername,
                        guildId: guild.id 
                    });
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); 
        }

        console.log(`[DailyChecker] Total entries collected for guild ${guild.id}: ${allUsersEntriesTodayInGuild.length}`);

        const groupedViewings = {};
        allUsersEntriesTodayInGuild.forEach(entry => {
            if (entry.guildId !== guild.id) return; 

            const groupKey = `${entry.slug}`; 

            if (!groupedViewings[groupKey]) {
                groupedViewings[groupKey] = {
                    title: entry.title,
                    slug: entry.slug,
                    year: entry.year,
                    viewingIds: new Set(), 
                    users: new Map(), 
                    reviews: [], 
                    posterUrl: null, 
                };
            }

            if (!sentDailyViewings[todayFormatted][entry.viewing_id]) {
                groupedViewings[groupKey].viewingIds.add(entry.viewing_id);
                groupedViewings[groupKey].users.set(entry.discordId, entry.letterboxdUsername);
                if (entry.hasReview) {
                    const existingReview = groupedViewings[groupKey].reviews.find(r => r.username === entry.letterboxdUsername);
                    if (!existingReview) {
                        groupedViewings[groupKey].reviews.push({
                            username: entry.letterboxdUsername,
                            reviewUrl: entry.reviewUrl,
                        });
                    }
                }
                sentDailyViewings[todayFormatted][entry.viewing_id] = true; 
            }
        });

        console.log(`[DailyChecker] Total grouped viewings for guild ${guild.id}: ${Object.keys(groupedViewings).length}`);

        for (const groupKey in groupedViewings) {
            const group = groupedViewings[groupKey];

            if (group.viewingIds.size === 0) {
                continue;
            }

            let movieData = null;
            try {
                movieData = await searchMovieTMDB(group.title, group.year);
                group.posterUrl = movieData ? getTmdbPosterUrl(movieData.poster_path) : null;
            } catch (error) {
                console.error(`[DailyChecker] Error fetching poster for ${group.title}:`, error.message);
            }

            const userMentions = Array.from(group.users.keys()).map(id => `<@${id}>`).join(', ');
            const usernames = Array.from(group.users.values()).join(', '); 
            const filmTitleWithYear = `${group.title} (${group.year || 'Unknown Year'})`;

            let description = `🍿 ${userMentions} logged [${filmTitleWithYear}](https://letterboxd.com/film/${group.slug}/) today.`;

            if (group.reviews.length > 0) {
                const reviewLinks = group.reviews.map(review => {
                    return `[${review.username}](${review.reviewUrl})`; 
                }).join(', ');
                description += `\n\nReview: ${reviewLinks}`; 
            }

            const embed = new EmbedBuilder()
                .setColor(0x6f52e3) 
                .setTitle(`🎬 Watched Today`) 
                .setDescription(description)
                .setThumbnail(group.posterUrl)
                .setTimestamp();

            try {
                await channel.send({ embeds: [embed] });
                console.log(`[DailyChecker] Sent embed for ${filmTitleWithYear} watched by ${usernames} in guild ${guild.id}.`);
            } catch (error) {
                console.error(`[DailyChecker] Error sending embed to channel ${channel.id} in guild ${guild.id}:`, error.message);
            }
            await new Promise(resolve => setTimeout(resolve, 2000)); 
        }
    }
    console.log('[DailyChecker] Daily watched films check completed.');
    await saveSentViewingsCache(); 
}

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
}, 60 * 60 * 1000);
