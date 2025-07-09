# 🎬 Letterboxd Discord Bot

Um bot para Discord desenvolvido em Node.js que integra funcionalidades da plataforma Letterboxd diretamente nos seus servidores! Obtenha informações sobre filmes assistidos, reviews, filmes favoritos e mais, diretamente do perfil dos usuários do Letterboxd.

## ⚠️ Considerações Técnicas

Este projeto utiliza **web scraping** para coletar dados da plataforma Letterboxd. Esta escolha técnica se deve ao fato de o Letterboxd **não disponibilizar uma API pública** de fácil acesso. Para utilizar a API oficial, é necessário submeter uma aplicação formal e ser aprovado, o que pode ser um processo demorado e desafiador para projetos de estudo e desenvolvimento em pequena escala.

Optar pelo web scraping permite a flexibilidade de extrair as informações necessárias diretamente das páginas HTML visíveis, possibilitando o desenvolvimento das funcionalidades desejadas, embora exija manutenção caso a estrutura do site do Letterboxd sofra alterações.

## ✨ Tecnologias Utilizadas

* **Node.js**: Ambiente de execução.
* **discord.js**: Biblioteca para interação com a API do Discord.
* **axios**: Cliente HTTP para fazer requisições web.
* **cheerio**: Biblioteca para web scraping (análise de HTML).
* **sharp**: Processamento e manipulação de imagens para criar grades de pôsteres.

## 🚀 Configuração e Instalação

Siga estes passos para colocar o bot em funcionamento em seu ambiente local ou em um servidor.

### Pré-requisitos

* Node.js (versão 18.x ou superior)
* npm (gerenciador de pacotes do Node.js, geralmente vem com o Node.js)
* Conta de desenvolvedor Discord para criar um bot e obter seu TOKEN.
* Chave de API do TMDB (The Movie Database) para obter informações e pôsteres de filmes.

### Passos de Instalação

1.  **Clone o Repositório:**
    ```bash
    git clone [https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git](https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git)
    cd SEU_REPOSITORIO # Entre na pasta do projeto
    ```
    *(Substitua `SEU_USUARIO` e `SEU_REPOSITORIO` pelos seus dados reais do GitHub.)*

2.  **Instale as Dependências:**
    ```bash
    npm install
    ```

3.  **Configuração de Variáveis de Ambiente (`.env`):**
    Crie um arquivo chamado `.env` na raiz do seu projeto (na mesma pasta onde está `package.json` e `env.example`). Copie o conteúdo de `env.example` para `.env` e preencha com suas chaves e tokens reais.

    ```
    # Exemplo de .env
    DISCORD_TOKEN=SEU_TOKEN_DO_BOT_DISCORD_AQUI
    TMDB_API_KEY=SUA_CHAVE_DE_API_TMDB_AQUI
    ```
    **Lembre-se: O arquivo `.env` nunca deve ser compartilhado ou comitado no Git!**

4.  **Registre seu Bot no Discord:**
    * Vá para o [Portal do Desenvolvedor do Discord](https://discord.com/developers/applications).
    * Crie uma nova aplicação, dê um nome ao seu bot.
    * Vá em `Bot` > `Add Bot` e `Reset Token` para obter seu `DISCORD_TOKEN`.
    * Ative os `Privileged Gateway Intents` necessários (MESSAGE CONTENT INTENT, PRESENCE INTENT, SERVER MEMBERS INTENT, se for usar).
    * Convide o bot para o seu servidor.

5.  **Registre os Comandos de Barra (`Slash Commands`):**
    Para que seus comandos apareçam no Discord, você precisa registrá-los.
    ```bash
    node deploy-commands.js
    ```

6.  **Execute o Bot:**
    ```bash
    node index.js # Ou o nome do seu arquivo principal do bot
    ```
    Seu bot deverá ficar online no Discord!

## ✨ Funcionalidades Atuais

Aqui estão os comandos que o bot oferece atualmente:

* **`/link [username]` (e `/unlink`):**
    * Permite aos usuários vincular (ou desvincular) suas contas do Discord a um nome de usuário do Letterboxd. Essencial para que o bot possa acessar dados públicos do perfil.
    * *Melhoria futura:* O bot verificará a existência do usuário Letterboxd antes de vincular.
* **`/diary [usuario] [dia] [mes] [ano]`:**
    * Exibe os filmes que um usuário assistiu em um dia específico no Letterboxd. Por padrão, mostra os filmes da data atual, mas aceita dia, mês e ano como parâmetros.
* **`/review [usuario] [filme]`:**
    * Mostra a última review de um usuário ou permite buscar reviews por título de filme. Consegue navegar por múltiplas páginas de reviews no Letterboxd.
* **`/favorites [usuario]`:**
    * Exibe os 4 filmes favoritos de um usuário do Letterboxd. Coleta os slugs dos filmes, busca detalhes precisos (título, ano) na página de cada filme, e obtém os pôsteres do TMDB. A resposta é dividida em um embed (lista de filmes) e uma imagem separada (grade de pôsteres).
* **`/likesgrid [usuario]`:**
    * Gera uma grade personalizável de pôsteres com base nos filmes que um usuário curtiu no Letterboxd. Oferece um menu interativo para escolher o tamanho da grade (ex: 2x2, 3x3, 5x5).
* **`/profile [usuario]`:**
    * Mostra estatísticas gerais do perfil Letterboxd de um usuário, incluindo filmes assistidos (total e este ano), seguidores, seguindo, watchlist e tags usadas.

## 🔮 Funcionalidades Futuras (Planejamento)

Estamos sempre trabalhando para melhorar o bot e adicionar novas capacidades! Aqui estão algumas das próximas features planejadas:

1.  **`/film` (Pesquisar Filme Letterboxd):**
    * **Objetivo:** Permitir a busca de qualquer filme na base de dados do Letterboxd.
    * **Detalhes:** Aceita um título, apresenta menu de seleção para múltiplos resultados e exibe sinopse, nota (TMDB), pôster, gêneros e link para o Letterboxd.

2.  **`/watchedfilm` (Filme Visto Pelo Usuário):**
    * **Objetivo:** Verificar se um usuário já assistiu a um filme específico ou se está em sua watchlist.
    * **Detalhes:** Utiliza a busca de filmes e verifica o diário completo do usuário e/ou sua watchlist, exibindo a data de log e nota se assistido.

3.  **`/director` (Filmes por Diretor):**
    * **Objetivo:** Pesquisar filmes dirigidos por um diretor específico.
    * **Detalhes:** Busca filmes no Letterboxd/TMDB por diretor e exibe uma lista em embed, com a foto do diretor.

4.  **`/compare` (Comparar Usuários):**
    * **Objetivo:** Encontrar filmes em comum entre dois usuários do Letterboxd.
    * **Detalhes:** Compara os diários completos de dois usuários e lista os filmes que ambos assistiram, mostrando detalhes como notas e datas.

5.  **`/top` (Ranking de Mais Assistidos no Servidor):**
    * **Objetivo:** Exibir um ranking dos filmes mais assistidos pelos usuários vinculados no servidor.
    * **Detalhes:** Esta é uma feature mais complexa, que idealmente exigiria um banco de dados para armazenar e agregar os dados de filmes assistidos dos usuários para garantir desempenho e precisão.

## 🤝 Como Contribuir

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues para bugs ou sugestões, ou enviar Pull Requests.
