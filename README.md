# 🎬 Letterboxd Discord Bot

Um bot completo para Discord desenvolvido em Node.js que integra funcionalidades da plataforma Letterboxd diretamente nos seus servidores!

Este bot permite que os usuários vinculem seus perfis do Letterboxd e compartilhem suas atividades, estatísticas, reviews, filmes favoritos e até comparem seus gostos com outros membros do servidor.

## ⚠️ Considerações Técnicas

Este projeto utiliza **web scraping** para coletar dados da plataforma Letterboxd. Esta escolha técnica se deve ao fato de o Letterboxd **não disponibilizar uma API pública** de fácil acesso. Para utilizar a API oficial, é necessário submeter uma aplicação formal e ser aprovado, o que pode ser um processo demorado e desafiador para projetos de estudo e desenvolvimento em pequena escala.

Optar pelo web scraping permite a flexibilidade de extrair as informações necessárias diretamente das páginas HTML visíveis, possibilitando o desenvolvimento das funcionalidades desejadas, embora exija manutenção caso a estrutura do site do Letterboxd sofra alterações.

## ✨ Funcionalidades Principais

* **Busca Completa:** Pesquise filmes e diretores com o comando `/search`.
* **Interação com Perfil:** Veja estatísticas, favoritos, diário e reviews com os comandos `/profile`, `/favorites`, `/diary` e `/review`.
* **Análise de Atividade:** Verifique se um filme já foi assistido por alguém com `/checkfilm`.
* **Features Sociais:** Compare os filmes em comum entre dois usuários com `/compare` e receba sugestões da watchlist com `/hint`.
* **Ranking do Servidor:** Descubra os filmes mais populares do servidor com o comando `/top`!
* **Geração de Imagens:** Crie grades de pôsteres personalizadas com os comandos `/favorites` e `/likesgrid`.

## 🚀 Tecnologias Utilizadas

* **Node.js**
* **discord.js v14+** (Slash Commands, Buttons, Select Menus, Embeds)
* **axios** & **cheerio** para Web Scraping dos dados do Letterboxd.
* **API do TMDB** para enriquecimento de dados (pôsteres, sinopses, diretores).
* **sharp** para manipulação de imagens.
* **sqlite3** para armazenamento de dados persistentes para o ranking do servidor.

## 🤖 Comandos Disponíveis

Aqui está a lista completa de comandos:

* **`/link [username]`**: Vincula sua conta Discord a um perfil Letterboxd.
* **`/unlink`**: Desvincula sua conta.
* **`/search film: [termo]`**: Busca por um filme ou diretor.
* **`/checkfilm user: [@usuario] film: [filme]`**: Verifica se um usuário já assistiu a um filme.
* **`/profile [user]`**: Exibe as estatísticas gerais de um perfil Letterboxd.
* **`/favorites [user]`**: Mostra os 4 filmes favoritos de um usuário em uma lista e grade.
* **`/diary [user] [dia] [mes] [ano]`**: Mostra os filmes assistidos em uma data específica.
* **`/review [user] [film]`**: Exibe a última review ou busca uma review específica.
* **`/likesgrid [user]`**: Gera uma grade personalizada com pôsteres dos filmes curtidos.
* **`/compare user1: [@usuario] [user2: @usuario]`**: Compara e lista os filmes em comum entre dois usuários, com paginação.
* **`/hint [user]`**: Sugere um filme aleatório da watchlist de um usuário.
* **`/top`**: Exibe o top 5 filmes mais assistidos pelos membros do servidor que usaram `/sync`.
* **`/sync`**: Sincroniza seu diário do Letterboxd para alimentar o ranking do servidor.
* **`/help`**: Mostra esta lista de comandos.

## 🔧 Configuração e Instalação

Siga os passos abaixo para rodar sua própria instância do bot.

1.  **Clone o Repositório:**
    ```bash
    git clone [https://github.com/ravivver/letterbotd.git](https://github.com/ravivver/letterbotd.git)
    cd letterbotd
    ```
2.  **Instale as Dependências:**
    ```bash
    npm install
    ```
3.  **Configure o `.env`:**
    * Crie um arquivo `.env` na raiz do projeto.
    * Adicione as seguintes variáveis com suas chaves:
        ```env
        DISCORD_TOKEN=SEU_TOKEN_AQUI
        TMDB_API_KEY=SUA_CHAVE_AQUI
        ```
4.  **Configure o Banco de Dados (Primeira vez):**
    ```bash
    node database/setup.js
    ```
5.  **Registre os Comandos:**
    ```bash
    node deploy-commands.js
    ```
6.  **Inicie o Bot:**
    ```bash
    node index.js
    ```

## 🤝 Como Contribuir

Contribuições são bem-vindas! Sinta-se à vontade para abrir *issues* para reportar bugs ou sugerir melhorias, ou enviar *Pull Requests* com novas funcionalidades.

*Este projeto utiliza web scraping como principal fonte de dados do Letterboxd devido à falta de uma API pública de fácil acesso.*
