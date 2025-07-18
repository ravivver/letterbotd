import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Displays a list of all commands and how to use them.');

export async function execute(interaction) {

    const commands = [
        { name: '🔗 `/link` `username: [your_username]`', value: 'Links your Discord account to a Letterboxd username.\n*Example: `/link username: myusername`*' },
        { name: '🗑️ `/unlink`', value: 'Unlinks your account.' },
        { name: '⚙️ `/setchannel` `channel: [#channel]`', value: 'Sets the channel for daily watched film notifications.\n*Example: `/setchannel channel: #movies`*' },
        { name: '🔄 `/sync`', value: 'Synchronizes your Letterboxd diary to feed the server ranking.' },
        { name: '❓ `/help`', value: 'Displays this list of commands and how to use them.' },

        { name: '🔍 `/search` `term: [movie_or_director]`', value: 'Searches for a movie or director.\n*Example: `/search term: Dune`*' },
        { name: '✅ `/check` `user: [@user] film: [title]`', value: 'Checks if a user has watched a specific movie.\n*Example: `/check user: @Luiz film: Fight Club`*' },
        { name: '📊 `/profile` `user: [@user]`', value: 'Displays Letterboxd statistics for a user.\n*Example: `/profile user: @Luiz`*' },
        { name: '❤️ `/favorites` `user: [@user]`', value: 'Shows 4 favorite movies of a user.\n*Example: `/favorites user: @Luiz`*' },
        { name: '🗓️ `/diary` `user: [@user] day: DD month: MM year: YYYY`', value: 'Shows films watched on a specific date.\n*Example: `/diary day: 01 month: 01 year: 2025`*' },
        { name: '📝 `/review` `user: [@user] film: [title]`', value: 'Displays the latest or specific review.\n*Example: `/review film: Parasite`*' },
        { name: '🖼️ `/grid` `user: [@user]`', value: 'Generates a movie poster grid (liked or watched).\n*Example: `/grid user: @Luiz`*' },
        { name: '🎞️ `/last` `user: [@user]`', value: 'Shows the last movie watched by a user.\n*Example: `/last user: @Luiz`*' },

        { name: '🤝 `/compare` `user1: [@user] user2: [@user]`', value: 'Compares watched movies between two users.\n*Example: `/compare user1: @Luiz user2: @João`*' },
        { name: '💡 `/hint` `user: [@user]`', value: 'Suggests a random movie from a user’s watchlist.' },
        { name: '🏆 `/top`', value: 'Shows the top 5 most watched films in this server.' },
        { name: '🌍 `/topbot`', value: 'Shows the top 5 most watched films across all servers.' },

        { name: '🎯 `/quiz`', value: 'A quick game: guess the movie based on synopsis, poster, or quote.' },
        { name: '💞 `/taste` `user1: [@user] user2: [@user]`', value: 'Checks compatibility between two users (0–100%).' },
        { name: '👪 `/familymatch`', value: 'One starts, others join (max 5). Finds a movie for everyone to watch together.' },
        { name: '🕵️ `/impostor`', value: 'Bot shows 4 films — 3 loved, 1 rated 1★ or less. Guess the fake one.' },

        { name: '🎼 `/soundtrack` `film: [title]`', value: 'Returns the soundtrack or composer of a film.' },
        { name: '🧠 `/similar` `film: [title]`', value: 'Recommends similar films to the one given.' },
        { name: '🌍 `/trip` `year: [YYYY] genre: [type] country: [code]`', value: 'Suggests a film with filters like year, genre, or country.' },
        { name: '🪪 `/letterid`', value: 'Generates a “cinephile ID card” for your profile.' }
    ];

    const descriptionText = `Hello! Here are the available commands.\n\n✨ **Important:** To use most commands, you must first link your Letterboxd with \`/link\` and set the right channel with \`/setchannel\`.\n\nMade with 💚 by [Louiz](https://github.com/ravivver/)`;

    const helpEmbed = new EmbedBuilder()
        .setColor(0x00E054)
        .setTitle('🎬 LetterBotd — Command Guide')
        .setDescription(descriptionText)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .addFields(commands);

    await interaction.reply({ 
        embeds: [helpEmbed], 
        flags: [MessageFlags.Ephemeral]
    });
}