# Simulados ENADE/PND com questões recortadas

Esta versão resolve o problema do PDF inteiro: o aluno vê apenas as imagens recortadas das questões que o professor selecionou.

## Fluxo recomendado

1. Abra `cropper.html`.
2. Carregue o PDF da prova.
3. Escolha a página.
4. Desenhe um retângulo em volta da questão.
5. Preencha número original, origem, disciplina/tema e gabarito.
6. Clique em `Adicionar recorte`.
7. No final, clique em `Baixar ZIP com imagens + JSON`.
8. Suba as imagens baixadas para a pasta `questoes/` no GitHub.
9. No `admin.html`, faça login e importe o `questions_import.json`.
10. Em `Montar simulado`, selecione as questões desejadas e publique.

## Arquivos principais

- `index.html`: página do aluno.
- `admin.html`: painel do professor.
- `cropper.html`: recortador visual de questões do PDF.
- `config.js`: configuração do Supabase.
- `supabase_schema_imagens.sql`: cria as tabelas novas.
- `questoes/`: pasta onde as imagens recortadas devem ser enviadas.
- `assets/`: scripts e estilos.

## Supabase

Rode o conteúdo de `supabase_schema_imagens.sql` no SQL Editor do Supabase.

Esta versão usa:

- `questions`: banco de questões com `image_url`.
- `exams`: simulados publicados.
- `exam_questions`: relação entre simulado e questões.
- `exam_attempts`: tentativas e resultados.

## Importante sobre imagens

O campo `image_url` pode ser:

```text
questoes/tipo1_q031.png
```

ou uma URL pública completa.

Se você usar GitHub Pages, o mais simples é subir os arquivos PNG para a pasta `questoes/`.

## Configuração

Copie a URL do Supabase e a publishable/anon public key para `config.js`, sem `/rest/v1/` no fim da URL.

## Observação

Esta versão não faz OCR. Ela preserva a questão como imagem do PDF, o que mantém tabelas, gráficos, colunas e formatação original.
