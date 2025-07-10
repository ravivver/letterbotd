// commands/grid.js

import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import getLikedFilms from '../scraper/getLikedFilms.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createLikesGridImage } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    // NOME DO COMANDO ATUALIZADO
    .setName('grid')
    .setDescription('Gera uma grade de pôsteres dos filmes curtidos de um usuário.')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário para ver os filmes curtidos dele.')
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

    const allLikedFilms = await getLikedFilms(letterboxdUsername);

    if (!allLikedFilms || allLikedFilms.length === 0) {
        return interaction.editReply({ content: `Não encontrei nenhum filme curtido para \`${letterboxdUsername}\`.` });
    }

    // OPÇÕES DE GRADE EXPANDIDAS de 2x2 até 10x10
    const gridOptions = Array.from({ length: 9 }, (_, i) => {
        const size = i + 2;
        return { label: `${size}x${size} (${size * size} Filmes)`, value: `${size}x${size}` };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_grid_size')
        .setPlaceholder('Escolha o tamanho da grade...')
        .addOptions(gridOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.editReply({
        content: `O usuário \`${letterboxdUsername}\` tem ${allLikedFilms.length} filmes curtidos. Escolha o tamanho da grade:`,
        components: [row],
    });

    try {
        const selection = await reply.awaitMessageComponent({ 
            filter: i => i.user.id === interaction.user.id && i.customId === 'select_grid_size', 
            componentType: ComponentType.StringSelect, 
            time: 60_000 
        });

        const selectedGridValue = selection.values[0];
        const [cols, rows] = selectedGridValue.split('x').map(Number);
        const requiredFilms = cols * rows;
        const selectedOptionLabel = gridOptions.find(opt => opt.value === selectedGridValue)?.label || selectedGridValue;
        
        await selection.update({
            content: `Gerando grade de ${selectedOptionLabel} para ${letterboxdUsername}... Isso pode levar um momento.`,
            components: []
        });

        const filmsForGrid = allLikedFilms.slice(0, requiredFilms);
        const filmsWithDetails = [];

        for (const film of filmsForGrid) {
            // Usamos Promise.all para otimizar as buscas de cada filme
            const [preciseDetails, tmdbResult] = await Promise.all([
                film.slug ? getFilmDetailsFromSlug(film.slug) : Promise.resolve({ title: film.title, year: film.year }),
                searchMovieTMDB(film.title, film.year)
            ]);
            
            filmsWithDetails.push({
                title: preciseDetails.title,
                year: preciseDetails.year,
                slug: film.slug,
                posterUrl: tmdbResult ? `https://image.tmdb.org/t/p/w154${tmdbResult.poster_path}` : null
            });
        }
        
        const { embed, attachment } = await createLikesGridImage(filmsWithDetails, letterboxdUsername, cols, rows);

        await interaction.editReply({
            content: `Grade de Filmes Curtidos de **${letterboxdUsername}** (${selectedOptionLabel}):`,
            embeds: [embed],
        });

        if (attachment) {
            await interaction.followUp({ files: [attachment] });
        }

    } catch (err) {
        await interaction.editReply({ content: 'Tempo esgotado! Você não selecionou um tamanho de grade.', components: [] }).catch(console.error);
    }
}