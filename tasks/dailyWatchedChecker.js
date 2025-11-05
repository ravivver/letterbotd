// dailyWatchedChecker.js (CÓDIGO CORRIGIDO)

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDailyDiaryEntries } from '../scraper/getDailyDiaryEntries.js';
import { getTmdbPosterUrl, searchMovieTMDB } from '../api/tmdb.js';

// REMOVIDA: import { getUserGuilds } from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');
const sentViewingsCachePath = path.join(__dirname, '..', 'storage', 'sent_viewings_cache.json');
const guildConfigsPath = path.join(__dirname, '..', 'storage', 'guild_configs.json');

let sentDailyViewings = {};
let guildConfigs = {};

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

async function saveSentViewingsCache() {
    try {
        await fs.writeFile(sentViewingsCachePath, JSON.stringify(sentDailyViewings, null, 2), 'utf8');
        console.log('[DailyChecker] Sent viewings cache saved successfully.');
    } catch (error) {
        console.error('[DailyChecker] Error saving sent viewings cache:', error);
    }
}

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

export async function checkDailyWatchedFilms(client) {
    if (Object.keys(sentDailyViewings).length === 0) {
        await loadSentViewingsCache();
    }
    // Carregar configurações de guilda é essencial para saber onde enviar notificações
    await loadGuildConfigs(); 

    console.log('[DailyChecker] Starting daily watched films check...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayFormatted = today.toISOString().split('T')[0];

    if (!sentDailyViewings[todayFormatted]) {
        sentDailyViewings[todayFormatted] = {};
    }

    let usersData;
    try {
        // Agora lê do arquivo JSON, mas em um ambiente de migração real você leria do MongoDB
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        console.error('[DailyChecker] Error reading users.json:', error);
        return;
    }

    const notificationsByGuildAndFilm = {};

    for (const discordId in usersData) {
        let userEntry = usersData[discordId];
        if (typeof userEntry === 'string') {
            userEntry = { letterboxd: userEntry, last_sync_date: null };
        }
        const letterboxdUsername = userEntry.letterboxd;

        if (letterboxdUsername) {
            console.log(`[DailyChecker] Verifying diary of ${letterboxdUsername} for today (${todayFormatted})...`);
            const entries = await getDailyDiaryEntries(letterboxdUsername, today);

            for (const entry of entries) {
                // A chave de cache deve ser global, pois o Viewing ID é único
                if (!sentDailyViewings[todayFormatted][entry.viewing_id]) {
                    
                    // CORREÇÃO: Iterar por TODAS as guildas que têm um canal configurado (O MAIS SEGURO)
                    // Anteriormente, o código tentava buscar as guildas que o usuário estava no DB, 
                    // o que falha. Agora, iteramos sobre as guildas que podemos notificar.
                    
                    for (const userGuildId in guildConfigs) {
                        const notificationChannelId = guildConfigs[userGuildId]?.notification_channel_id;

                        if (notificationChannelId) {
                            const guild = client.guilds.cache.get(userGuildId);
                            const channel = guild?.channels.cache.get(notificationChannelId);
                            
                            if (channel && channel instanceof TextChannel) {
                                
                                if (!notificationsByGuildAndFilm[userGuildId]) {
                                    notificationsByGuildAndFilm[userGuildId] = {};
                                }
                                const groupKey = entry.slug;

                                if (!notificationsByGuildAndFilm[userGuildId][groupKey]) {
                                    notificationsByGuildAndFilm[userGuildId][groupKey] = {
                                        title: entry.title,
                                        slug: entry.slug,
                                        year: entry.year,
                                        viewingIds: new Set(),
                                        users: new Map(),
                                        reviews: [],
                                        posterUrl: null,
                                    };
                                }

                                const filmGroup = notificationsByGuildAndFilm[userGuildId][groupKey];
                                filmGroup.viewingIds.add(entry.viewing_id);
                                filmGroup.users.set(discordId, letterboxdUsername);

                                if (entry.hasReview && entry.reviewUrl) {
                                    const existingReviewForUser = filmGroup.reviews.find(r => r.discordId === discordId);
                                    if (!existingReviewForUser) {
                                        filmGroup.reviews.push({
                                            discordId: discordId,
                                            username: letterboxdUsername,
                                            reviewUrl: entry.reviewUrl,
                                        });
                                    }
                                }
                            } else {
                                console.warn(`[DailyChecker] Configured channel ${notificationChannelId} for guild ${userGuildId} not found or not a text channel. Cannot send notification.`);
                            }
                        }
                    }
                    // Marca como enviado APÓS iterar por todas as guildas, garantindo que não será reprocessado hoje
                    sentDailyViewings[todayFormatted][entry.viewing_id] = true;
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // ... (restante da lógica de envio de notificações)
    // ... (A lógica de envio abaixo parece correta e não precisa de grandes ajustes)

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

            let movieData = null;
            try {
                movieData = await searchMovieTMDB(group.title, group.year);
                group.posterUrl = movieData ? getTmdbPosterUrl(movieData.poster_path) : null;
            } catch (error) {
                console.error(`[DailyChecker] Error fetching poster for ${group.title}:`, error.message);
            }

            const userMentions = Array.from(group.users.keys()).map(discordId => `<@${discordId}>`).join(', ');
            const filmTitleWithYear = `${group.title} (${group.year || 'Unknown Year'})`;

            let description = `${userMentions} registrou [${filmTitleWithYear}](https://letterboxd.com/film/${group.slug}/) no diário.`;

            if (group.reviews.length > 0) {
                const reviewLinks = group.reviews.map(review => {
                    return `[${review.username}](${review.reviewUrl})`;
                }).join(', ');
                description += `\n\n**Review:** ${reviewLinks}`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x6f52e3)
                .setTitle(`🍿 Novo Registro Diário`)
                .setDescription(description)
                .setThumbnail(group.posterUrl);

            try {
                await channel.send({ embeds: [embed] });
                console.log(`[DailyChecker] Sent embed for ${filmTitleWithYear} watched by ${Array.from(group.users.values()).join(', ')} in guild ${guild.id}.`);
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
        sentDailyViewings[todayFormatted] = {};
        saveSentViewingsCache();
    }
}, 60 * 60 * 1000);