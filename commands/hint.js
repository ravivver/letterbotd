// commands/hint.js (Versão com menu interativo e resposta final pública)

import { SlashCommandBuilder, EmbedBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Importa os scrapers necessários
import { getWatchlist } from '../scraper/getWatchlist.js';
import getLikedFilms from '../scraper/getLikedFilms.js';
import { getFullDiary } from '../scraper/getFullDiary.js';

import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('hint')
    .setDescription('Suggests a random movie from a user\'s watchlist, liked films, or watched films.') 
    .addUserOption(option =>
        option.setName('user')
        .setDescription('The user to fetch the suggestion for (default: yourself).') 
        .setRequired(false));

export async function execute(interaction) {
    const targetDiscordUser = interaction.options.getUser('user') || interaction.user;
    
    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        return interaction.reply({ content: 'Error reading user file.', flags: [MessageFlags.Ephemeral] });
    }
    
    let letterboxdUsername;
    const userEntry = usersData[targetDiscordUser.id];
    if (typeof userEntry === 'string') {
        letterboxdUsername = userEntry;
    } else if (typeof userEntry === 'object' && userEntry !== null) {
        letterboxdUsername = userEntry.letterboxd;
    }

    if (!letterboxdUsername) {
        const who = targetDiscordUser.id === interaction.user.id ? 'You have not linked' : `User ${targetDiscordUser.displayName} has not linked`;
        return interaction.reply({ content: `${who} a Letterboxd account. Use /link.`, flags: [MessageFlags.Ephemeral] });
    }

    // --- Criar o menu de seleção ---

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('hint_source_select')
        .setPlaceholder('Select a source for the hint...') 
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Watchlist')
                .setValue('watchlist'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Liked Films')
                .setValue('liked'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Watched Films')
                .setValue('diary'),
        );

    const actionRow = new ActionRowBuilder().addComponents(selectMenu);

    // Resposta inicial efêmera para o menu de seleção
    await interaction.reply({
        content: `Please select the source of the movie suggestion for ${letterboxdUsername}:`,
        components: [actionRow],
        ephemeral: true 
    });

    // --- Aguardar a seleção do usuário ---

    let selectedSource = null;
    let componentInteraction = null;

    try {
        componentInteraction = await interaction.channel.awaitMessageComponent({
            filter: i => i.customId === 'hint_source_select' && i.user.id === interaction.user.id,
            time: 60000 
        });

        selectedSource = componentInteraction.values[0];

        // Acknowledge the component interaction and remove the menu
        await componentInteraction.deferUpdate();
        await interaction.editReply({ content: 'Fetching suggestion...', components: [] });

    } catch (error) {
        if (error.message.includes('time')) {
            await interaction.editReply({ content: 'Selection timed out.', components: [] });
        } else {
            console.error('Error awaiting selection:', error);
            await interaction.editReply({ content: 'An error occurred while waiting for your selection.', components: [] });
        }
        return;
    }

    // --- Processar a seleção e buscar a sugestão ---

    let filmSlugs = [];
    let sourceName = '';
    let finalEmbed = null;

    try {
        if (selectedSource === 'watchlist') {
            filmSlugs = await getWatchlist(letterboxdUsername);
            sourceName = 'watchlist';
        } else if (selectedSource === 'liked') {
            const likedFilms = await getLikedFilms(letterboxdUsername);
            filmSlugs = likedFilms.map(film => film.slug);
            sourceName = 'liked films';
        } else if (selectedSource === 'diary') {
            const diaryEntries = await getFullDiary(letterboxdUsername);
            filmSlugs = diaryEntries.map(entry => entry.slug);
            sourceName = 'watched films';
        }

        if (!filmSlugs || filmSlugs.length === 0) {
            // Se a lista estiver vazia, edite a mensagem efêmera com o erro e retorne.
            await interaction.editReply({ content: `${letterboxdUsername}'s ${sourceName} is empty or could not be accessed!` });
            return;
        }

        const randomSlug = filmSlugs[Math.floor(Math.random() * filmSlugs.length)];

        // --- Buscar detalhes do filme e criar o embed ---
        const filmDetails = await getFilmDetailsFromSlug(randomSlug);
        if (!filmDetails) throw new Error('Could not retrieve details for the randomly selected movie from Letterboxd.');
        
        const movieDataTMDB = await searchMovieTMDB(filmDetails.title, filmDetails.year);
        if (!movieDataTMDB) throw new Error('Could not find movie details on TMDB.');

        finalEmbed = new EmbedBuilder()
            .setColor(0xF4B740)
            .setTitle(`How about watching: ${filmDetails.title} (${filmDetails.year})?`)
            .setURL(`https://letterboxd.com/film/${randomSlug}/`)
            .setAuthor({ name: `A suggestion from ${letterboxdUsername}'s ${sourceName}` })
            .setDescription(movieDataTMDB.overview || 'Synopsis not available.')
            .addFields(
                { name: 'Genres', value: movieDataTMDB.genres.join(', ') || 'N/A', inline: true },
                { name: 'Director(s)', value: movieDataTMDB.directors.join(', ') || 'N/A', inline: true }
            )
            .setImage(getTmdbPosterUrl(movieDataTMDB.poster_path, 'w500'))
        
        // --- Enviar a resposta final publicamente usando followUp ---
        await interaction.followUp({ content: '', embeds: [finalEmbed] });
        
    } catch (error) {
        console.error('Error in /hint command:', error);
        // Em caso de erro, edite a mensagem efêmera inicial para mostrar o erro ao usuário.
        await interaction.editReply({ content: `An error occurred while fetching the suggestion: ${error.message}` });
    }
}