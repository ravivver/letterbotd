import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import getLikedFilms from '../scraper/getLikedFilms.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createGridImage } from '../utils/formatEmbed.js';

import { 
    getDailyWatchedFilms, 
    getWeeklyWatchedFilms, 
    getMonthlyWatchedFilms, 
    getAnnualWatchedFilms 
} from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('grid')
    .setDescription('Generates a poster grid of movies (liked or watched).')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Mention another user to view their grid.')
            .setRequired(false));

export async function execute(interaction) {
    await interaction.deferReply();

    const targetDiscordUser = interaction.options.getUser('user') || interaction.user;
    let usersData = {};
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (e) { /* ignores if file does not exist */ }
    
    const userEntry = usersData[targetDiscordUser.id];
    let letterboxdUsername;
    if (typeof userEntry === 'string') letterboxdUsername = userEntry;
    else if (typeof userEntry === 'object' && userEntry !== null) letterboxdUsername = userEntry.letterboxd;

    if (!letterboxdUsername) {
        const who = targetDiscordUser.id === interaction.user.id ? 'You have not linked' : `User ${targetDiscordUser.displayName} has not linked`;
        return interaction.editReply({ content: `${who} a Letterboxd account. Use /link.`, ephemeral: true });
    }

    const typeOptions = [
        { label: 'Liked Movies (Likes)', description: 'Grid of movies you liked.', value: 'likes_grid' },
        { label: 'Watched Movies (Daily)', description: 'Grid of movies watched today.', value: 'watched_daily_grid' },
        { label: 'Watched Movies (Weekly)', description: 'Grid of movies watched last week.', value: 'watched_weekly_grid' },
        { label: 'Watched Movies (Monthly)', description: 'Grid of movies watched last month.', value: 'watched_monthly_grid' },
        { label: 'Watched Movies (Annual)', description: 'Grid of movies watched last year.', value: 'watched_annual_grid' },
    ];

    const typeSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_grid_type')
        .setPlaceholder('Choose grid type...')
        .addOptions(typeOptions);

    const typeRow = new ActionRowBuilder().addComponents(typeSelectMenu);

    const initialReply = await interaction.editReply({
        content: `Generate grid for **${letterboxdUsername}**. Please choose the grid type:`,
        components: [typeRow],
    });

    try {
        const typeSelection = await initialReply.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id && i.customId === 'select_grid_type',
            componentType: ComponentType.StringSelect,
            time: 60_000
        });

        const selectedGridType = typeSelection.values[0];
        let filmsRawData = []; 
        let gridTitle = '';
        
        const selectedTypeLabel = typeOptions.find(opt => opt.value === selectedGridType)?.label || selectedGridType;

        await typeSelection.update({
            content: `Grid type selected: **${selectedTypeLabel}**.`,
            components: []
        });

        if (selectedGridType === 'likes_grid') {
            filmsRawData = await getLikedFilms(letterboxdUsername);
            gridTitle = `Liked Movies of ${letterboxdUsername}`;
            console.log(`[Grid Debug] Raw Liked Films (${filmsRawData.length}):`, filmsRawData.slice(0, 5));
        } else {
            switch (selectedGridType) {
                case 'watched_daily_grid':
                    filmsRawData = await getDailyWatchedFilms(letterboxdUsername, interaction.guildId);
                    gridTitle = `Movies Watched Today by ${letterboxdUsername}`;
                    break;
                case 'watched_weekly_grid':
                    filmsRawData = await getWeeklyWatchedFilms(letterboxdUsername, interaction.guildId);
                    gridTitle = `Movies Watched Last Week by ${letterboxdUsername}`;
                    break;
                case 'watched_monthly_grid':
                    filmsRawData = await getMonthlyWatchedFilms(letterboxdUsername, interaction.guildId);
                    gridTitle = `Movies Watched Last Month by ${letterboxdUsername}`;
                    break;
                case 'watched_annual_grid':
                    filmsRawData = await getAnnualWatchedFilms(letterboxdUsername, interaction.guildId);
                    gridTitle = `Movies Watched Last Year by ${letterboxdUsername}`;
                    break;
                default:
                    await interaction.followUp({ content: 'Invalid grid type selected.', ephemeral: true });
                    return;
            }
            console.log(`[Grid Debug] Raw Watched Films (${selectedGridType}, ${filmsRawData.length}):`, filmsRawData.slice(0, 5));
        }

        const filmsWithDetailsAndPosters = [];
        for (const film of filmsRawData) {
            let currentFilmTitle = film.title || film.film_title; 
            let currentFilmYear = film.year || film.film_year;   
            let currentFilmSlug = film.slug || film.film_slug;   

            console.log(`[Grid Debug] Initial film data (from DB/Scraper): Title: ${currentFilmTitle}, Year: ${currentFilmYear}, Slug: ${currentFilmSlug}`);

            if (selectedGridType === 'likes_grid') {
                const preciseDetails = await getFilmDetailsFromSlug(currentFilmSlug); 
                if (preciseDetails) {
                    currentFilmTitle = preciseDetails.title;
                    currentFilmYear = preciseDetails.year;
                    currentFilmSlug = preciseDetails.slug;
                } else {
                    currentFilmTitle = film.title;
                    currentFilmYear = film.year;
                    currentFilmSlug = film.slug;
                }
                console.log(`[Grid Debug] After getFilmDetailsFromSlug (if likes): Title: ${currentFilmTitle}, Year: ${currentFilmYear}, Slug: ${currentFilmSlug}`);
            }
            
            let tmdbResult = null;
            if (currentFilmTitle) { 
                try {
                    tmdbResult = await searchMovieTMDB(currentFilmTitle, currentFilmYear);
                } catch (tmdbError) {
                    console.error(`[Grid Debug] Error fetching TMDB for ${currentFilmTitle}:`, tmdbError.message);
                }
            }
            
            filmsWithDetailsAndPosters.push({
                title: currentFilmTitle,
                year: currentFilmYear,
                slug: currentFilmSlug,
                posterUrl: tmdbResult ? `https://image.tmdb.org/t/p/w154${tmdbResult.poster_path}` : null
            });
            console.log(`[Grid Debug] Final film data for push: Title: ${filmsWithDetailsAndPosters[filmsWithDetailsAndPosters.length - 1].title}, Year: ${filmsWithDetailsAndPosters[filmsWithDetailsAndPosters.length - 1].year}, Slug: ${filmsWithDetailsAndPosters[filmsWithDetailsAndPosters.length - 1].slug}, Poster: ${filmsWithDetailsAndPosters[filmsWithDetailsAndPosters.length - 1].posterUrl ? 'OK' : 'N/A'}`);
        }
        
        const filmsToGrid = filmsWithDetailsAndPosters;

        const gridOptions = Array.from({ length: 9 }, (_, i) => {
            const size = i + 2;
            return { label: `${size}x${size} (${size * size} Films)`, value: `${size}x${size}` };
        });

        const sizeSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_grid_size')
            .setPlaceholder('Choose grid size...')
            .addOptions(gridOptions);

        const sizeRow = new ActionRowBuilder().addComponents(sizeSelectMenu);

        const sizeReply = await interaction.followUp({
            content: `User \`${letterboxdUsername}\` has ${filmsToGrid.length} films available. Choose grid size:`,
            components: [sizeRow],
            ephemeral: true
        });

        const sizeSelection = await sizeReply.awaitMessageComponent({ 
            filter: i => i.user.id === interaction.user.id && i.customId === 'select_grid_size', 
            componentType: ComponentType.StringSelect, 
            time: 60_000 
        });

        const selectedGridSizeValue = sizeSelection.values[0];
        const [cols, rows] = selectedGridSizeValue.split('x').map(Number);
        const requiredFilms = cols * rows;
        const selectedOptionLabel = gridOptions.find(opt => opt.value === selectedGridSizeValue)?.label || selectedGridSizeValue;
        
        await sizeSelection.update({
            content: `Generating ${selectedOptionLabel} grid for ${letterboxdUsername}... This may take a moment.`,
            components: []
        });

        const filmsForGrid = filmsToGrid.slice(0, requiredFilms);
        
        const { embed, attachment } = await createGridImage(filmsForGrid, gridTitle, cols, rows);

        await interaction.editReply({
            content: `Grid of ${gridTitle} (${selectedOptionLabel}):`,
            embeds: [embed],
        });

        if (attachment) {
            await interaction.followUp({ files: [attachment] });
        }

    } catch (err) {
        if (err.message.includes('time')) {
            await interaction.followUp({ content: 'Selection time has expired!', ephemeral: true });
        } else {
            console.error('Error processing grid selection:', err);
            await interaction.followUp({ content: `An error occurred while generating the grid: ${err.message}`, ephemeral: true });
        }
    }
}