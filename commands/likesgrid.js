// commands/likesgrid.js

import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import getLikedFilms from '../scraper/getLikedFilms.js'; // Novo scraper de likes
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js'; // Para detalhes precisos
import { searchMovieTMDB } from '../api/tmdb.js';
// Precisaremos criar ou adaptar uma função para gerar a imagem da grade de likes no formatEmbed.js
import { createLikesGridImage } from '../utils/formatEmbed.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('likesgrid')
    .setDescription('Gera uma grade de pôsteres dos seus filmes curtidos do Letterboxd.')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário do Discord para ver os filmes curtidos dele.')
            .setRequired(false));

export async function execute(interaction) {
    // Deferimos a resposta inicialmente, para mostrar que o bot está pensando
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
            if (readError.code !== 'ENOENT') {
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

        // --- Passo 1: Obter TODOS os filmes curtidos (apenas slugs e títulos preliminares) ---
        const allLikedFilms = await getLikedFilms(letterboxdUsername);

        if (!allLikedFilms || allLikedFilms.length === 0) {
            await interaction.editReply({
                content: `Não encontrei nenhum filme curtido para \`${letterboxdUsername}\`.`,
                // Esta mensagem é pública. Se quiser efêmera, adicione flags: MessageFlags.Ephemeral
            });
            return;
        }

        // --- Passo 2: Apresentar o menu de seleção de tamanho da grade ---
        const gridOptions = [
            { label: '2x2 (4 Filmes)', value: '2x2', required: 4 },
            { label: '3x3 (9 Filmes)', value: '3x3', required: 9 },
            { label: '5x5 (25 Filmes)', value: '5x5', required: 25 },
            { label: '8x8 (64 Filmes)', value: '8x8', required: 64 },
            { label: '10x10 (100 Filmes)', value: '10x10', required: 100 }
        ];

        const availableOptions = gridOptions.filter(option => allLikedFilms.length >= option.required);

        if (availableOptions.length === 0) {
            await interaction.editReply({
                content: `O usuário \`${letterboxdUsername}\` tem apenas ${allLikedFilms.length} filmes curtidos. Não há opções de grade disponíveis (mínimo de 4 filmes).`,
            });
            return;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select-grid-size')
            .setPlaceholder('Escolha o tamanho da grade...')
            .addOptions(availableOptions.map(option => ({
                label: option.label,
                description: `Requer ${option.required} filmes.`,
                value: option.value
            })));

        const row = new ActionRowBuilder()
            .addComponents(selectMenu);

        // A mensagem com o menu é pública e edita a resposta inicial
        await interaction.editReply({
            content: `O usuário \`${letterboxdUsername}\` tem ${allLikedFilms.length} filmes curtidos. Por favor, escolha o tamanho da grade de pôsteres:`,
            components: [row],
        });

        // --- Passo 3: Coletar a interação do menu ---
        const collector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: i => i.customId === 'select-grid-size' && i.user.id === interaction.user.id,
            time: 90000, // 90 segundos para responder
        });

        collector.on('collect', async i => {
            await i.deferUpdate(); // Deferir a atualização da interação do select menu

            const selectedGridValue = i.values[0]; // Ex: "3x3"
            const [cols, rows] = selectedGridValue.split('x').map(Number);
            const requiredFilms = cols * rows;

            // Encontrar a opção selecionada para pegar o label
            const selectedOptionLabel = availableOptions.find(opt => opt.value === selectedGridValue)?.label || selectedGridValue;

            // Remover o menu após a seleção, e mostrar "Gerando..."
            await i.editReply({
                content: `Gerando grade de ${selectedOptionLabel} para ${letterboxdUsername}... Por favor, aguarde.`,
                components: [] // Remove o menu
            });

            // --- Passo 4: Obter detalhes precisos e pôsteres para os filmes necessários ---
            const filmsForGrid = allLikedFilms.slice(0, requiredFilms); // Pega apenas os N primeiros filmes

            const filmsWithPreciseDetailsAndTmdb = [];
            let errorsDuringProcessing = false;

            for (const film of filmsForGrid) {
                let preciseDetails = null;
                let tmdbPosterUrl = null;

                if (film.slug) {
                    preciseDetails = await getFilmDetailsFromSlug(film.slug);
                }

                // Se não conseguimos detalhes precisos, usamos o que temos do scraper de likes
                if (!preciseDetails) {
                    preciseDetails = { title: film.title, year: film.year }; // Usa o título/ano provisório
                    console.log(`Aviso: Não foi possível obter detalhes precisos via slug para "${film.slug}". Usando dados preliminares.`);
                    errorsDuringProcessing = true;
                }

                if (preciseDetails.title) {
                    try {
                        const tmdbResult = await searchMovieTMDB(preciseDetails.title, preciseDetails.year);
                        if (tmdbResult && tmdbResult.poster_path) {
                            tmdbPosterUrl = `https://image.tmdb.org/t/p/w342${tmdbResult.poster_path}`;
                        } else {
                            console.log(`Aviso: TMDB não encontrou pôster para "${preciseDetails.title}" (${preciseDetails.year || 'ano desconhecido'}).`);
                            errorsDuringProcessing = true;
                        }
                    } catch (tmdbError) {
                        console.error(`Erro ao buscar TMDB para "${preciseDetails.title}":`, tmdbError.message);
                        errorsDuringProcessing = true;
                    }
                } else {
                    console.log(`Aviso: Título não disponível para buscar no TMDB para um filme. Slug: ${film.slug}`);
                    errorsDuringProcessing = true;
                }

                filmsWithPreciseDetailsAndTmdb.push({
                    title: preciseDetails.title,
                    year: preciseDetails.year,
                    posterUrl: tmdbPosterUrl // A URL do pôster do TMDB
                });
            }

            // --- Passo 5: Gerar a imagem da grade e o embed ---
            // A função createLikesGridImage será criada no formatEmbed.js
            const { embed, attachment } = await createLikesGridImage(filmsWithPreciseDetailsAndTmdb, letterboxdUsername, cols, rows);

            let finalWarning = '';
            if (errorsDuringProcessing) {
                finalWarning = '\n\n⚠️ Atenção: Alguns pôsteres ou informações podem estar ausentes/incorretos devido a dificuldades de busca.';
            }

            // Enviar a primeira mensagem com o embed (editando o i.editReply, que é o deferUpdate do select menu)
            await i.editReply({
                content: `Grade de Filmes Curtidos de **${letterboxdUsername}** (${selectedOptionLabel}):` + finalWarning,
                embeds: [embed],
            });

            // Se a imagem foi gerada, enviar uma segunda mensagem com ela
            if (attachment) {
                await interaction.followUp({
                    files: [attachment],
                });
            }

            collector.stop(); // Parar o coletor após a seleção
        });

        collector.on('end', async collected => {
            if (collected.size === 0) {
                // Se o usuário não selecionou nada dentro do tempo limite
                await interaction.editReply({
                    content: 'Tempo esgotado! Você não selecionou nenhuma opção de grade. Por favor, tente o comando novamente.',
                    components: []
                }).catch(console.error);
            }
        });

    } catch (error) {
        console.error(`Erro geral no comando /likesgrid para ${targetUserTag}:`, error);
        let errorMessage = `Ocorreu um erro ao processar o comando. Detalhes: ${error.message}`;
        if (error.message.includes('Perfil Letterboxd é privado')) {
            errorMessage = `O perfil Letterboxd de \`${letterboxdUsername}\` é privado. Não é possível acessar os filmes curtidos.`;
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