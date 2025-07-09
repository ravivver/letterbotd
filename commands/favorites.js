// commands/favorites.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getFavorites from '../scraper/getFavorites.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createFavoritesEmbed } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('favorites')
    .setDescription('Mostra os 4 filmes favoritos do seu perfil Letterboxd.')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário do Discord para ver os favoritos dele.')
            .setRequired(false));

export async function execute(interaction) {
    // Primeiramente, deferimos a interação PUBLICAMENTE.
    await interaction.deferReply(); 

    let targetDiscordId = interaction.user.id;
    let targetUserTag = interaction.user.tag;

    const mentionedUser = interaction.options.getUser('usuario');
    if (mentionedUser) {
        targetDiscordId = mentionedUser.id;
        targetUserTag = mentionedUser.tag;
    }

    try {
        let users = {};
        try {
            const data = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(data);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                users = {};
            } else {
                console.error(`Erro ao ler users.json: ${readError.message}`);
                await interaction.editReply({
                    content: 'Ocorreu um erro interno ao buscar os vínculos de usuário. Por favor, tente novamente mais tarde.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }

        const letterboxdUsername = users[targetDiscordId];

        if (!letterboxdUsername) {
            await interaction.editReply({
                content: `O usuário ${targetUserTag} não vinculou sua conta Letterboxd ainda. Peça para ele usar \`/link\`!`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const favoriteFilmsPreliminary = await getFavorites(letterboxdUsername);

        if (!favoriteFilmsPreliminary || favoriteFilmsPreliminary.length === 0) {
            await interaction.editReply({
                content: `Não encontrei nenhum filme favorito para \`${letterboxdUsername}\`.`,
            });
            return;
        }

        const filmsWithTmdbDetails = [];
        let errorsFetchingDetails = false;

        for (const film of favoriteFilmsPreliminary) {
            let preciseFilmDetails = {
                title: film.title,
                year: film.year,
                slug: film.slug,
                url: film.url
            };
            let tmdbDetails = null;

            if (film.slug) {
                const detailsFromSlug = await getFilmDetailsFromSlug(film.slug);
                if (detailsFromSlug) {
                    preciseFilmDetails.title = detailsFromSlug.title;
                    preciseFilmDetails.year = detailsFromSlug.year;
                } else {
                    console.log(`Aviso: Não foi possível obter detalhes precisos para o filme com slug "${film.slug}". Usando dados preliminares.`);
                    errorsFetchingDetails = true;
                }
            } else {
                console.log(`Aviso: Slug não disponível para o filme "${film.title}". Não foi possível obter detalhes precisos. Usando dados preliminares.`);
                errorsFetchingDetails = true;
            }

            if (preciseFilmDetails.title) {
                try {
                    tmdbDetails = await searchMovieTMDB(preciseFilmDetails.title, preciseFilmDetails.year);
                    if (!tmdbDetails) {
                        console.log(`Aviso: TMDB não encontrou detalhes para "${preciseFilmDetails.title}" (${preciseFilmDetails.year || 'ano desconhecido'}).`);
                        errorsFetchingDetails = true;
                    }
                } catch (tmdbError) {
                    console.error(`Erro ao buscar TMDB para "${preciseFilmDetails.title}":`, tmdbError.message);
                    errorsFetchingDetails = true;
                }
            } else {
                console.log(`Aviso: Título não disponível para buscar no TMDB para um filme favorito.`);
                errorsFetchingDetails = true;
            }

            filmsWithTmdbDetails.push({
                ...preciseFilmDetails,
                tmdbDetails
            });
        }

        const { embed, attachment } = await createFavoritesEmbed(filmsWithTmdbDetails, letterboxdUsername);

        if (errorsFetchingDetails) {
            const warningText = '\n\n⚠️ Atenção: Alguns pôsteres ou informações podem estar ausentes/incorretos devido a dificuldades em obter os detalhes completos dos filmes.';
            embed.setDescription((embed.description || '') + warningText);
        }

        // --- ESTRATÉGIA DE DUAS MENSAGENS SEPARADAS ---

        // 1. Enviar a primeira mensagem com APENAS o embed (editando o deferReply inicial)
        await interaction.editReply({
            embeds: [embed],
            // Não inclua 'files' aqui!
        });

        // 2. Se houver um anexo (imagem), enviar uma SEGUNDA mensagem com ele usando followUp.
        if (attachment) {
            await interaction.followUp({
                files: [attachment],
                // ephemeral: false (followUp é público por padrão, mas pode ser especificado)
            });
        }

    } catch (error) {
        console.error(`Erro geral ao processar comando /favorites para ${targetUserTag}:`, error);
        let errorMessage = `Ocorreu um erro ao acessar o Letterboxd deste usuário. Detalhes: ${error.message}`;
        if (error.message.includes('Perfil Letterboxd é privado')) {
            errorMessage = `O perfil Letterboxd de \`${letterboxdUsername}\` é privado. Não é possível acessar os favoritos.`;
        } else if (error.message.includes('Usuário Letterboxd não encontrado')) {
            errorMessage = `O usuário Letterboxd \`${letterboxdUsername}\` não foi encontrado.`;
        } else if (error.message.includes('Não foi possível conectar ao Letterboxd')) {
            errorMessage = `Não foi possível conectar ao Letterboxd. Verifique a conexão do bot ou tente novamente mais tarde.`;
        }
        await interaction.editReply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral
        });
    }
}