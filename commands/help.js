// commands/help.js (Versão com link no crédito)

import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Exibe uma lista de todos os comandos e como usá-los.');

export async function execute(interaction) {

    const commands = [
        { name: '✨ /link `[username]`', value: 'Vincula sua conta Discord a um perfil Letterboxd.\n*Exemplo: `/link meuusuario`*' },
        { name: '🔍 /search `film: [filme]`', value: 'Busca por um filme ou diretor. Um menu de seleção aparecerá para múltiplos resultados.\n*Exemplo: `/search film: Duna`*' },
        { name: '✅ /checkfilm `user: [@usuario] film: [filme]`', value: 'Verifica se um usuário já assistiu a um filme específico.\n*Exemplo: `/checkfilm user: @Amigo film: Corra!`*' },
        { name: '❤️ /favorites `[user]`', value: 'Exibe os 4 filmes favoritos de um usuário.\n*Exemplo: `/favorites user: @Amigo`*' },
        { name: '📊 /profile `[user]`', value: 'Exibe as estatísticas gerais de um perfil Letterboxd.\n*Exemplo: `/profile`*' },
        { name: '🖼️ /likesgrid `[user]`', value: 'Gera uma grade personalizada com pôsteres dos filmes curtidos.\n*Exemplo: `/likesgrid`*' },
        { name: '📝 /review `[user] [film]`', value: 'Exibe a última review de um usuário ou busca uma review específica.\n*Exemplo: `/review film: Parasita`*' },
        { name: '🗓️ /diary `[user] [dia] [mes] [ano]`', value: 'Mostra os filmes assistidos em uma data específica.\n*Exemplo: `/diary dia: 31 mes: 10 ano: 2024`*' },
        { name: '🤝 /compare `user1: [@usuario] [user2: @usuario]`', value: 'Compara os filmes assistidos entre dois usuários e mostra os que eles têm em comum.\n*Exemplo: `/compare user1: @Amigo1 user2: @Amigo2`*' },
        { name: '💡 /hint `[user]`', value: 'Sugere um filme aleatório da watchlist de um usuário para assistir.\n*Exemplo: `/hint user: @Amigo`*' },
        { name: '🏆 /top `[quantidade]`', value: 'Exibe um ranking dos filmes mais assistidos pelos membros do servidor.\n*Exemplo: `/top quantidade: 5`*' },
        { name: '❌ /unlink', value: 'Desvincula sua conta do Discord do seu perfil Letterboxd.' }
    ];

    // ALTERAÇÃO: Movendo o crédito para o final da descrição
    const descriptionText = `Olá! Aqui estão os comandos disponíveis. Lembre-se que para a maioria deles, você precisa estar vinculado com o \`/link\`.
    \n*Bot desenvolvido por [Louiz](https://github.com/ravivver/).*`;


    const helpEmbed = new EmbedBuilder()
        .setColor(0x00E054)
        .setTitle('Guia de Comandos do LetterBotd')
        .setDescription(descriptionText) // Usando o novo texto com o link
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .addFields(commands)
        // ALTERAÇÃO: Removendo o setFooter
        // .setFooter({ text: 'Bot em desenvolvimento por Louiz.' }); 

    await interaction.reply({ 
        embeds: [helpEmbed], 
        flags: [MessageFlags.Ephemeral]
    });
}