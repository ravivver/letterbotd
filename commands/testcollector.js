// commands/testcollector.js

import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('testcollector')
        .setDescription('Tests if the bot can collect messages in this channel.'),
    async execute(interaction) {
        await interaction.deferReply();

        await interaction.editReply('Starting message collection test. Type something in the next 15 seconds!');

        const filter = m => m.author.id !== interaction.client.user.id; // Coleta QUALQUER mensagem que NÃO seja do próprio bot
        
        const collector = interaction.channel.createMessageCollector({ filter, time: 15000 }); // 15 segundos

        collector.on('collect', m => {
            console.log(`[TestCollector] Collected message: "${m.content}" from ${m.author.tag}`);
            interaction.followUp(`I collected your message: "${m.content}"`);
            collector.stop(); // Parar após a primeira mensagem para este teste
        });

        collector.on('end', collected => {
            console.log(`[TestCollector] Collector ended. Total messages collected: ${collected.size}`);
            if (collected.size === 0) {
                interaction.followUp('No messages were collected during the test.');
            }
        });
    },
};