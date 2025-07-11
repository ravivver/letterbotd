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

const CHANNEL_ID = '1393081506494287922'; 

let sentDailyViewings = {}; 

async function loadSentViewingsCache() {
    try {
        const data = await fs.readFile(sentViewingsCachePath, 'utf8');
        sentDailyViewings = JSON.parse(data);
        console.log('[DailyChecker] Cache de visualizações enviadas carregado com sucesso.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[DailyChecker] Arquivo de cache de visualizações não encontrado. Iniciando com cache vazio.');
            sentDailyViewings = {};
        } else {
            console.error('[DailyChecker] Erro ao carregar cache de visualizações:', error);
            sentDailyViewings = {};
        }
    }
}

async function saveSentViewingsCache() {
    try {
        await fs.writeFile(sentViewingsCachePath, JSON.stringify(sentDailyViewings, null, 2), 'utf8');
        console.log('[DailyChecker] Cache de visualizações enviadas salvo com sucesso.');
    } catch (error) {
        console.error('[DailyChecker] Erro ao salvar cache de visualizações:', error);
    }
}

export async function checkDailyWatchedFilms(client) {
    if (Object.keys(sentDailyViewings).length === 0) {
        await loadSentViewingsCache();
    }

    console.log('[DailyChecker] Iniciando verificação de filmes assistidos no dia...');

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
        console.error('[DailyChecker] Erro ao ler users.json:', error);
        return;
    }

    const allUsersEntriesToday = []; 

    for (const discordId in usersData) {
        let userEntry = usersData[discordId];
        if (typeof userEntry === 'string') { 
            userEntry = { letterboxd: userEntry, last_sync_date: null };
        }
        const letterboxdUsername = userEntry.letterboxd;

        if (letterboxdUsername) {
            console.log(`[DailyChecker] Verificando diário de ${letterboxdUsername} para hoje (${todayFormatted})...`);
            const entries = await getDailyDiaryEntries(letterboxdUsername, today);
            
            entries.forEach(entry => {
                allUsersEntriesToday.push({
                    ...entry,
                    discordId: discordId,
                    letterboxdUsername: letterboxdUsername,
                });
            });
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); 
    }

    const groupedViewings = {};
    allUsersEntriesToday.forEach(entry => {
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

    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel || !(channel instanceof TextChannel)) {
        console.error(`[DailyChecker] Canal com ID ${CHANNEL_ID} não encontrado ou não é um canal de texto. Verifique o CHANNEL_ID.`);
        return;
    }

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
            console.error(`[DailyChecker] Erro ao buscar pôster para ${group.title}:`, error.message);
        }

        const userMentions = Array.from(group.users.keys()).map(id => `<@${id}>`).join(', ');
        const usernames = Array.from(group.users.values()).join(', '); 
        const filmTitleWithYear = `${group.title} (${group.year || 'Ano Desconhecido'})`;

        let description = `${userMentions} logged [${filmTitleWithYear}](https://letterboxd.com/film/${group.slug}/)`;

        if (group.reviews.length > 0) {
            const reviewLinks = group.reviews.map(review => {
                return `[${review.username}](${review.reviewUrl})`; 
            }).join(', ');
            description += `\n\nReview: ${reviewLinks}`; 
        }

        const embed = new EmbedBuilder()
            .setColor(0x6f52e3) 
            .setTitle(`🍿 Visto no Dia`) 
            .setDescription(description)
            .setThumbnail(group.posterUrl)

        try {
            await channel.send({ embeds: [embed] });
            console.log(`[DailyChecker] Enviado embed para ${filmTitleWithYear} assistido por ${usernames}.`);
        } catch (error) {
            console.error(`[DailyChecker] Erro ao enviar embed para o canal ${CHANNEL_ID}:`, error.message);
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); 
    }
    console.log('[DailyChecker] Verificação de filmes assistidos no dia concluída.');
    await saveSentViewingsCache(); 
}

setInterval(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayFormatted = today.toISOString().split('T')[0];
    if (!sentDailyViewings[todayFormatted] && Object.keys(sentDailyViewings).length > 0) {
        console.log('[DailyChecker] Novo dia detectado. Limpando cache de visualizações enviadas.');
        for (const key in sentDailyViewings) {
            delete sentDailyViewings[key];
        }
        saveSentViewingsCache(); 
    }
}, 60 * 60 * 1000);
