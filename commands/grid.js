// commands/grid.js

import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import getLikedFilms from '../scraper/getLikedFilms.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createGridImage } from '../utils/formatEmbed.js'; // Importa a função genérica de grid

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
    .setDescription('Gera uma grade de pôsteres de filmes (curtidos ou assistidos).')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário para ver a grade dele.')
            .setRequired(false));

export async function execute(interaction) {
    await interaction.deferReply();

    const targetDiscordUser = interaction.options.getUser('usuario') || interaction.user;
    let usersData = {};
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (e) { /* ignora se o arquivo não existe */ }
    
    const userEntry = usersData[targetDiscordUser.id];
    let letterboxdUsername;
    if (typeof userEntry === 'string') letterboxdUsername = userEntry;
    else if (typeof userEntry === 'object' && userEntry !== null) letterboxdUsername = userEntry.letterboxd;

    if (!letterboxdUsername) {
        const who = targetDiscordUser.id === interaction.user.id ? 'Você não vinculou' : `O usuário ${targetDiscordUser.displayName} não vinculou`;
        return interaction.editReply({ content: `${who} uma conta do Letterboxd. Use /link.`, ephemeral: true });
    }

    const typeOptions = [
        { label: 'Filmes Curtidos (Likes)', description: 'Grade dos filmes que você curtiu.', value: 'likes_grid' },
        { label: 'Filmes Assistidos (Diário)', description: 'Grade dos filmes assistidos hoje.', value: 'watched_daily_grid' },
        { label: 'Filmes Assistidos (Semanal)', description: 'Grade dos filmes assistidos na última semana.', value: 'watched_weekly_grid' },
        { label: 'Filmes Assistidos (Mensal)', description: 'Grade dos filmes assistidos no último mês.', value: 'watched_monthly_grid' },
        { label: 'Filmes Assistidos (Anual)', description: 'Grade dos filmes assistidos no último ano.', value: 'watched_annual_grid' },
    ];

    const typeSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_grid_type')
        .setPlaceholder('Escolha o tipo de grade...')
        .addOptions(typeOptions);

    const typeRow = new ActionRowBuilder().addComponents(typeSelectMenu);

    const initialReply = await interaction.editReply({
        content: `Gerar grade para **${letterboxdUsername}**. Por favor, escolha o tipo de grade:`,
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
            content: `Tipo de grade selecionado: **${selectedTypeLabel}**.`,
            components: []
        });

        if (selectedGridType === 'likes_grid') {
            filmsRawData = await getLikedFilms(letterboxdUsername);
            gridTitle = `Filmes Curtidos de ${letterboxdUsername}`;
            console.log(`[Grid Debug] Filmes Curtidos Brutos (${filmsRawData.length}):`, filmsRawData.slice(0, 5));
        } else {
            switch (selectedGridType) {
                case 'watched_daily_grid':
                    filmsRawData = await getDailyWatchedFilms(letterboxdUsername);
                    gridTitle = `Filmes Assistidos Hoje por ${letterboxdUsername}`;
                    break;
                case 'watched_weekly_grid':
                    filmsRawData = await getWeeklyWatchedFilms(letterboxdUsername);
                    gridTitle = `Filmes Assistidos na Última Semana por ${letterboxdUsername}`;
                    break;
                case 'watched_monthly_grid':
                    filmsRawData = await getMonthlyWatchedFilms(letterboxdUsername);
                    gridTitle = `Filmes Assistidos no Último Mês por ${letterboxdUsername}`;
                    break;
                case 'watched_annual_grid':
                    filmsRawData = await getAnnualWatchedFilms(letterboxdUsername);
                    gridTitle = `Filmes Assistidos no Último Ano por ${letterboxdUsername}`;
                    break;
                default:
                    await interaction.followUp({ content: 'Tipo de grade inválido selecionado.', ephemeral: true });
                    return;
            }
            console.log(`[Grid Debug] Filmes Assistidos Brutos (${selectedGridType}, ${filmsRawData.length}):`, filmsRawData.slice(0, 5));
        }

        const filmsWithDetailsAndPosters = [];
        for (const film of filmsRawData) {
            let currentFilmTitle = null;
            let currentFilmYear = null;
            let currentFilmSlug = null;

            if (selectedGridType === 'likes_grid') {
                const preciseDetails = await getFilmDetailsFromSlug(film.slug);
                if (preciseDetails) {
                    currentFilmTitle = preciseDetails.title;
                    currentFilmYear = preciseDetails.year;
                    currentFilmSlug = preciseDetails.slug;
                } else {
                    currentFilmTitle = film.title;
                    currentFilmYear = film.year;
                    currentFilmSlug = film.slug;
                }
            } else {
                currentFilmTitle = film.film_title;
                currentFilmYear = film.film_year;
                currentFilmSlug = film.film_slug;
            }
            
            let tmdbResult = null;
            if (currentFilmTitle) { 
                try {
                    tmdbResult = await searchMovieTMDB(currentFilmTitle, currentFilmYear);
                } catch (tmdbError) {
                    console.error(`[Grid Debug] Erro ao buscar TMDB para ${currentFilmTitle}:`, tmdbError.message);
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
            return { label: `${size}x${size} (${size * size} Filmes)`, value: `${size}x${size}` };
        });

        const sizeSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_grid_size')
            .setPlaceholder('Escolha o tamanho da grade...')
            .addOptions(gridOptions);

        const sizeRow = new ActionRowBuilder().addComponents(sizeSelectMenu);

        const sizeReply = await interaction.followUp({
            content: `O usuário \`${letterboxdUsername}\` tem ${filmsToGrid.length} filmes disponíveis. Escolha o tamanho da grade:`,
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
            content: `Gerando grade de ${selectedOptionLabel} para ${letterboxdUsername}... Isso pode levar um momento.`,
            components: []
        });

        const filmsForGrid = filmsToGrid.slice(0, requiredFilms);
        
        const { embed, attachment } = await createGridImage(filmsForGrid, gridTitle, cols, rows);

        await interaction.editReply({
            content: `Grade de ${gridTitle} (${selectedOptionLabel}):`,
            embeds: [embed],
        });

        if (attachment) {
            await interaction.followUp({ files: [attachment] });
        }

    } catch (err) {
        if (err.message.includes('time')) {
            await interaction.followUp({ content: 'Tempo esgotado para seleção!', ephemeral: true });
        } else {
            console.error('Erro ao processar seleção de grade:', err);
            await interaction.followUp({ content: `Ocorreu um erro ao gerar a grade: ${err.message}`, ephemeral: true });
        }
    }
}
