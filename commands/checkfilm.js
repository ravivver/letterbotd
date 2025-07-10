// commands/checkfilm.js (Versão Final com Fluxo Público Estável)

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { searchLetterboxd } from '../scraper/searchLetterboxd.js';
import { checkFilmInDiary } from '../scraper/checkFilmInDiary.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('checkfilm')
    .setDescription('Verifica se um usuário já assistiu a um filme específico.')
    .addUserOption(option => option.setName('user').setDescription('O usuário a ser verificado.').setRequired(true))
    .addStringOption(option => option.setName('film').setDescription('O título do filme que você deseja verificar.').setRequired(true));

export async function execute(interaction) {
    // Validações iniciais continuam efêmeras
    const targetDiscordUser = interaction.options.getUser('user');
    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        return interaction.reply({ content: 'Erro ao ler o arquivo de usuários.', flags: [MessageFlags.Ephemeral] });
    }
    const userEntry = usersData[targetDiscordUser.id];
    let letterboxdUsername;
    if (typeof userEntry === 'string') letterboxdUsername = userEntry;
    else if (typeof userEntry === 'object' && userEntry !== null) letterboxdUsername = userEntry.letterboxd;

    if (!letterboxdUsername) {
        return interaction.reply({ content: `O usuário ${targetDiscordUser.username} não vinculou uma conta.`, flags: [MessageFlags.Ephemeral] });
    }

    // ALTERAÇÃO PRINCIPAL: A partir daqui, a interação é pública.
    await interaction.deferReply(); 

    const filmQuery = interaction.options.getString('film');
    const searchResults = await searchLetterboxd(filmQuery);
    const filmResults = searchResults.filter(r => r.type === 'film');

    if (filmResults.length === 0) {
        // Este erro agora será público, como parte do fluxo normal
        return interaction.editReply({ content: `Nenhum filme encontrado para a busca "${filmQuery}".` });
    }

    if (filmResults.length > 1) {
        const filmOptions = filmResults.map(film => ({
            label: film.title.substring(0, 100),
            description: film.year ? `Ano: ${film.year}` : 'Filme',
            value: film.slug,
        }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('checkfilm_select').setPlaceholder('Vários filmes encontrados. Selecione um.').addOptions(filmOptions.slice(0, 25));
        const row = new ActionRowBuilder().addComponents(selectMenu);

        // O menu de seleção agora é enviado publicamente
        const reply = await interaction.editReply({
            content: `Encontramos múltiplos filmes. Por favor, escolha um para verificar:`,
            components: [row],
            fetchReply: true, // Importante para poder adicionar o 'awaitMessageComponent'
        });

        try {
            // Usando a forma mais robusta de esperar por um componente
            const selection = await reply.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id,
                componentType: ComponentType.StringSelect,
                time: 60_000,
            });
            const filmSlug = selection.values[0];
            // Passamos a 'selection' que é a nova interação
            await processFilmCheck(selection, targetDiscordUser, letterboxdUsername, filmSlug);
        } catch (err) {
            await interaction.editReply({ content: 'O tempo para seleção esgotou.', components: [] });
        }
    } else {
        const filmSlug = filmResults[0].slug;
        // Passamos a 'interaction' original, pois não houve menu
        await processFilmCheck(interaction, targetDiscordUser, letterboxdUsername, filmSlug);
    }
}

async function processFilmCheck(interaction, discordUser, letterboxdUsername, filmSlug) {
    // Se a interação for de um componente, primeiro damos um update para o usuário ver
    if (interaction.isMessageComponent()) {
        await interaction.update({ content: 'Verificando diário...', components: [] });
    }

    try {
        const filmDetails = await getFilmDetailsFromSlug(filmSlug);
        if (!filmDetails) throw new Error('Não foi possível obter detalhes do filme no Letterboxd.');
        
        const [diaryStatus, movieDataTMDB] = await Promise.all([
            checkFilmInDiary(letterboxdUsername, filmSlug),
            searchMovieTMDB(filmDetails.title, filmDetails.year)
        ]);

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Verificando para: ${letterboxdUsername}`, iconURL: discordUser.displayAvatarURL() })
            .setTitle(`${filmDetails.title} (${filmDetails.year})`)
            .setURL(`https://letterboxd.com/film/${filmSlug}/`)
            .setThumbnail(movieDataTMDB ? getTmdbPosterUrl(movieDataTMDB.poster_path) : null);

        if (diaryStatus.watched) {
            embed.setColor(0x23A55A); // Verde
            let description = `🟢 ** Sim, ${discordUser.displayName} assistiu!**`;
            let detailsLine = '';

            if (diaryStatus.rating) {
                const stars = '⭐'.repeat(Math.floor(diaryStatus.rating));
                const halfStar = (diaryStatus.rating % 1 !== 0) ? '½' : '';
                detailsLine += `**Nota:** ${stars}${halfStar}`;
            }

            if (diaryStatus.date) {
                const formattedDate = diaryStatus.date.split('-').reverse().join('/');
                if (detailsLine.length > 0) {
                    // ALTERADO: Removido o '|' e mantido um espaçamento maior
                    detailsLine += '   '; 
                }
                detailsLine += `** Data:** ${formattedDate}`;
            }

            if(detailsLine.length > 0) {
                description += `\n\n${detailsLine}`;
            }
            
            embed.setDescription(description);

        } else {
            embed.setColor(0xED4245); // Vermelho
            embed.setDescription(`🔴 ** Não, ${discordUser.displayName} não assistiu.**`);
        }
        
        await interaction.editReply({ content: '', embeds: [embed], components: [] });

    } catch (error) {
        console.error('Erro ao processar a checagem do filme:', error);
        await interaction.editReply({ content: `Ocorreu um erro ao verificar o filme: ${error.message}`, embeds: [], components: [] });
    }
}