// commands/help.js (Version with credit link - Translated to English)

import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Displays a list of all commands and how to use them.');

export async function execute(interaction) {

    const commands = [
        { name: '✅ `/check` `user: [@user] film: [film_title]`', value: 'Checks if a user has watched a specific movie.\n*Example: `/check user: @Friend film: Get Out!`*' },
        { name: '🤝 `/compare` `user1: [@user] [user2: @user]`', value: 'Compares watched movies between two users.\n*Example: `/compare user1: @Friend1 user2: @Friend2`*' },
        { name: '🗓️ `/diary` `[user: @user] [day: DD] [month: MM] [year: YYYY]`', value: 'Shows all movies watched on a specific date on Letterboxd.\n*Example: `/diary day: 31 month: 10 year: 2024`*' },
        { name: '❤️ `/favorites` `[user: @user]`', value: 'Displays a user\'s 4 favorite movies.\n*Example: `/favorites user: @Friend`*' },
        { name: '🖼️ `/grid` `[user: @user]`', value: 'Generates a poster grid of movies (liked or watched).\n*Example: `/grid user: @Friend`*' },
        { name: '❓ `/help`', value: 'Displays this list of commands and how to use them.' },
        { name: '💡 `/hint` `[user: @user]`', value: 'Suggests a random movie from a user\'s watchlist.' },
        { name: '🎬 `/last` `[user: @user]`', value: 'Shows the last movie watched on a user\'s Letterboxd profile.\n*Example: `/last user: @Friend`*' },
        { name: '🔗 `/link` `username: [your_username]`', value: 'Associates your Discord ID with a Letterboxd username.\n*Example: `/link username: myusername`*' },
        { name: '📊 `/profile` `[user: @user]`', value: 'Displays a user\'s Letterboxd profile statistics.\n*Example: `/profile`*' },
        { name: '📝 `/review` `[user: @user] [film: film_title]`', value: 'Displays a user\'s latest review or searches for a specific movie review.\n*Example: `/review film: Parasite`*' },
        { name: '🔍 `/search` `term: [movie_or_director_name]`', value: 'Searches for a movie or director on Letterboxd. A selection menu will appear for multiple results.\n*Example: `/search term: Dune`*' },
        { name: '⚙️ `/setchannel` `channel: [#channel_name]`', value: 'Sets the channel for daily watched film notifications for this server.\n*Example: `/setchannel channel: #daily-watches`*' },
        { name: '🔄 `/sync`', value: 'Synchronizes your Letterboxd diary with the bot to feed the server ranking.' },
        { name: '🏆 `/top`', value: 'Displays the top 5 most watched films in this server.' },
        { name: '🌍 `/topbot`', value: 'Displays the top 5 most watched films across all servers.' },
        { name: '🗑️ `/unlink`', value: 'Unlinks your Discord account from your Letterboxd profile.' }
    ];

    // Translated description text
    const descriptionText = `Hello! Here are the available commands. Remember that for most of them, you need to be linked with \`/link\`.\n\n*Bot developed by [Louiz](https://github.com/ravivver/).*`;

    const helpEmbed = new EmbedBuilder()
        .setColor(0x00E054) // Green color
        .setTitle('LetterBotd Command Guide') // Translated title
        .setDescription(descriptionText) // Using the new translated text with the link
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .addFields(commands);

    await interaction.reply({ 
        embeds: [helpEmbed], 
        flags: [MessageFlags.Ephemeral]
    });
}
