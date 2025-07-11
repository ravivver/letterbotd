import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { searchLetterboxd, getDirectorFilms } from '../scraper/searchLetterboxd.js';
// Importamos as novas funções da API
import { searchMovieTMDB, getTmdbPosterUrl, searchPersonTMDB, getPersonDetailsTMDB } from '../api/tmdb.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';

export const data = new SlashCommandBuilder()
    .setName('search')
    .setDescription('Busca por um filme ou diretor no Letterboxd.')
    .addStringOption(option =>
        option.setName('termo')
            .setDescription('O nome do filme ou do diretor que você deseja pesquisar.')
            .setRequired(true));

export async function execute(interaction) {
    const termo = interaction.options.getString('termo');
    const searchResults = await searchLetterboxd(termo);

    if (searchResults.length === 0) {
        return interaction.reply({ 
            content: `Nenhum resultado encontrado para a busca "${termo}".`,
            ephemeral: true 
        });
    }

    await interaction.deferReply(); 
    
    const options = searchResults.map(result => {
        if (result.type === 'film') {
            return {
                label: `[Filme] ${result.title}`.substring(0, 100),
                description: result.year ? `Ano: ${result.year}` : 'Filme',
                value: `film_${result.slug}`
            };
        } else if (result.type === 'director') {
            return {
                label: `[Diretor] ${result.name}`.substring(0, 100),
                description: 'Pessoa',
                value: `director_${result.name}|${result.pageUrl}` // Passar nome e URL
            };
        }
    }).filter(Boolean);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('search_result_select')
        .setPlaceholder('Vários resultados encontrados. Selecione um.')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const selectMessage = await interaction.editReply({
        content: `Encontramos ${searchResults.length} resultado(s) para "${termo}". Por favor, escolha um:`,
        components: [row]
    });

    const collector = selectMessage.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === interaction.user.id && i.customId === 'search_result_select',
        time: 60_000
    });

    collector.on('collect', async i => {
        // MUDANÇA AQUI: Mensagem de "Buscando informações..." para "Aqui está!"
        await i.update({ content: 'Aqui está!', components: [] }); 

        const selectedValue = i.values[0];
        const [type, ...rest] = selectedValue.split(/_(.*)/s);
        const identifier = rest[0];

        if (type === 'film') {
            await processFilmSelection(interaction, identifier);
        } else if (type === 'director') {
            const [name, pageUrl] = identifier.split('|');
            await processDirectorSelection(interaction, name, pageUrl);
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: 'O tempo para seleção esgotou.', components: [] });
        }
    });
}

// Função de filme atualizada SEM o rodapé
async function processFilmSelection(interaction, slug) {
    try {
        const letterboxdDetails = await getFilmDetailsFromSlug(slug);
        if (!letterboxdDetails) throw new Error('Não foi possível obter detalhes do Letterboxd.');

        const movieData = await searchMovieTMDB(letterboxdDetails.title, letterboxdDetails.year);
        if (!movieData) throw new Error('Filme não encontrado na base de dados do TMDB.');

        const filmEmbed = new EmbedBuilder()
            .setColor(0x00E054)
            .setTitle(`${movieData.title} (${letterboxdDetails.year})`)
            .setURL(`https://letterboxd.com/film/${slug}`)
            .setDescription(movieData.overview || 'Sinopse não disponível.')
            .addFields(
                { name: 'Gêneros', value: movieData.genres.join(', ') || 'N/A', inline: true },
                { name: 'Nota TMDB', value: movieData.vote_average ? `⭐ ${movieData.vote_average.toFixed(1)}/10` : 'N/A', inline: true }
            )
            .setImage(getTmdbPosterUrl(movieData.poster_path, 'w500'));

        await interaction.editReply({ embeds: [filmEmbed] });
    } catch (error) {
        console.error('Erro ao processar seleção de filme:', error);
        await interaction.editReply({ content: `Ocorreu um erro ao buscar os detalhes do filme: ${error.message}` });
    }
}


// --- VERSÃO COMPLETAMENTE REFEITA DA FUNÇÃO DE DIRETOR ---
async function processDirectorSelection(interaction, directorName, letterboxdUrl) {
    try {
        const [personResult, films] = await Promise.all([
            searchPersonTMDB(directorName),
            getDirectorFilms(letterboxdUrl)
        ]);

        if (!personResult) throw new Error('Diretor não encontrado no TMDB.');

        const personDetails = await getPersonDetailsTMDB(personResult.id);
        if (!personDetails) throw new Error('Não foi possível obter detalhes do diretor no TMDB.');

        // Descrição volta a ser apenas a biografia
        let biography = personDetails.biography || 'Biografia não disponível.';
        if (biography.length > 800) {
            biography = biography.substring(0, 800) + '...';
        }

        const filmList = films.length > 0
            ? films.slice(0, 15).map(film => `• [${film.title}](https://letterboxd.com${film.slug})`).join('\n')
            : 'Nenhum filme encontrado.';
        
        const directorEmbed = new EmbedBuilder()
            .setColor(0x445566)
            .setTitle(personDetails.name)
            .setURL(`https://letterboxd.com${letterboxdUrl}`)
            .setDescription(biography)
            .setThumbnail(getTmdbPosterUrl(personDetails.profile_path, 'w500'));

        // --- ALTERAÇÃO PRINCIPAL AQUI ---
        // Adicionamos os campos de volta, um ao lado do outro (inline: true)
        if (personDetails.birthday) {
            directorEmbed.addFields({ 
                name: 'Nascimento', 
                value: personDetails.birthday.split('-').reverse().join('/'), 
                inline: true 
            });
        }
        if (personDetails.place_of_birth) {
            directorEmbed.addFields({ 
                name: 'Local', // Texto alterado
                value: personDetails.place_of_birth, 
                inline: true 
            });
        }
        
        // Adicionamos o campo de filmografia por último (ele não é inline, então ocupará uma nova linha inteira)
        directorEmbed.addFields(
            { name: `Filmografia (${films.length} filmes)`, value: filmList }
        );
        // --- FIM DA ALTERAÇÃO ---
        
        await interaction.editReply({ embeds: [directorEmbed] });

    } catch (error) {
        console.error('Erro ao processar seleção de diretor:', error);
        await interaction.editReply({ content: `Ocorreu um erro ao buscar os detalhes do diretor: ${error.message}` });
    }
}
