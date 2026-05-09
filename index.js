require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "CLAIM_CHANNEL_ID",
  "WINNERS_CHANNEL_ID",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[CONFIG] Variable manquante: ${key}`);
    process.exit(1);
  }
}

const storePath = path.join(__dirname, "data", "store.json");

function ensureStore() {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    const initialData = { activeGiveaway: null, history: [] };
    fs.writeFileSync(storePath, JSON.stringify(initialData, null, 2), "utf8");
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function writeStore(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf8");
}

function formatDate(isoDate) {
  return `<t:${Math.floor(new Date(isoDate).getTime() / 1000)}:F>`;
}

function formatRewardLabel(rawReward) {
  const cleaned = rawReward.trim();
  const lower = cleaned.toLowerCase();
  if (lower.includes("robux")) return cleaned;
  return `${cleaned} € de Robux`;
}

function extractFirstUrl(text) {
  const match = text.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

const commands = [
  new SlashCommandBuilder()
    .setName("giveaway-create")
    .setDescription("Creer un giveaway avec un code secret")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("code")
        .setDescription("Code secret exact (sensible a la casse)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("video").setDescription("Nom ou ID de la video").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reward").setDescription("Ex: 5 EUR de Robux").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("expires_hours")
        .setDescription("Duree de validite en heures")
        .setMinValue(1)
        .setMaxValue(168)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("giveaway-close")
    .setDescription("Ferme le giveaway actif sans gagnant")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("giveaway-status")
    .setDescription("Affiche le statut du giveaway actif"),
].map((command) => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    { body: commands },
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", async () => {
  try {
    await registerCommands();
    console.log(`[READY] Connecte en tant que ${client.user.tag}`);
  } catch (error) {
    console.error("[COMMANDS] Impossible de deployer les commandes:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const store = readStore();

  if (interaction.commandName === "giveaway-create") {
    const code = interaction.options.getString("code", true).trim();
    const video = interaction.options.getString("video", true).trim();
    const videoUrl = extractFirstUrl(video);
    const reward = formatRewardLabel(interaction.options.getString("reward", true));
    const expiresHours = interaction.options.getInteger("expires_hours") ?? 48;

    if (store.activeGiveaway) {
      await interaction.reply({
        content:
          "Un giveaway est deja actif. Ferme-le d'abord avec `/giveaway-close` ou attends un gagnant.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresHours * 60 * 60 * 1000).toISOString();

    store.activeGiveaway = {
      code,
      video,
      reward,
      maxAttempts: 3,
      attemptsByUser: {},
      claimChannelId: process.env.CLAIM_CHANNEL_ID,
      winnersChannelId: process.env.WINNERS_CHANNEL_ID,
      createdAt: now.toISOString(),
      expiresAt,
      winner: null,
      closedAt: null,
      closeReason: null,
    };
    writeStore(store);

    const createEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Giveaway cree avec succes !")
      .setDescription("Le mini jeu est lance. Le premier qui trouve le code gagne.")
      .addFields(
        { name: "Video", value: `${video}` },
        { name: "Recompense", value: `**${reward}**` },
        { name: "Essais autorises", value: "**3 tentatives par membre**" },
        { name: "Expire le", value: `${formatDate(expiresAt)}` },
        { name: "Salon de participation", value: `<#${process.env.CLAIM_CHANNEL_ID}>` },
      )
      .setFooter({ text: "Conseil: cache bien ton code dans la video !" });

    await interaction.reply({ embeds: [createEmbed], flags: MessageFlags.Ephemeral });

    const claimChannel = await client.channels.fetch(process.env.CLAIM_CHANNEL_ID).catch(() => null);
    if (claimChannel && claimChannel.isTextBased()) {
      const publicStartEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Nouveau challenge Robux !")
        .setDescription(
          "Le code secret est **cache quelque part dans la video**. Regarde-la tres attentivement pour le trouver !",
        )
        .addFields(
          { name: "Recompense", value: `**${reward}**` },
          { name: "Regle", value: "**3 tentatives maximum** par membre" },
          { name: "Comment participer", value: "Envoie le code dans ce salon (#claim-video)." },
          { name: "Fin du challenge", value: `${formatDate(expiresAt)}` },
        )
        .setFooter({ text: "Le premier bon code gagne." });

      // Keep the video URL in raw text so Discord can unfurl a preview card.
      try {
        // Send the raw URL alone first so Discord can reliably unfurl the video preview card.
        if (videoUrl) {
          await claimChannel.send({ content: videoUrl });
        }
        await claimChannel.send({ embeds: [publicStartEmbed] });
      } catch (error) {
        console.error("[CLAIM_CHANNEL] Impossible d'envoyer le message de lancement:", error);
        await interaction.followUp({
          content:
            "Le giveaway est bien cree, mais je n'ai pas pu publier le message dans le salon de claim. Verifie les permissions du bot (Voir les salons + Envoyer des messages).",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }

  if (interaction.commandName === "giveaway-close") {
    if (!store.activeGiveaway) {
      await interaction.reply({ content: "Aucun giveaway actif.", flags: MessageFlags.Ephemeral });
      return;
    }

    store.activeGiveaway.closedAt = new Date().toISOString();
    store.activeGiveaway.closeReason = "closed_by_admin";
    store.history.push(store.activeGiveaway);
    store.activeGiveaway = null;
    writeStore(store);

    await interaction.reply({ content: "Giveaway ferme manuellement.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === "giveaway-status") {
    if (!store.activeGiveaway) {
      await interaction.reply({ content: "Aucun giveaway actif.", flags: MessageFlags.Ephemeral });
      return;
    }

    const g = store.activeGiveaway;
    const statusEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Giveaway actif")
      .addFields(
        { name: "Video", value: `${g.video}` },
        { name: "Recompense", value: `**${g.reward}**` },
        { name: "Essais autorises", value: `**${g.maxAttempts ?? 3} tentatives par membre**` },
        { name: "Expire le", value: `${formatDate(g.expiresAt)}` },
        { name: "Salon de participation", value: `<#${g.claimChannelId}>` },
      );

    await interaction.reply({ embeds: [statusEmbed], flags: MessageFlags.Ephemeral });
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const store = readStore();
  const g = store.activeGiveaway;
  if (!g) return;

  if (message.channelId !== g.claimChannelId) return;

  const now = Date.now();
  const expiresAt = new Date(g.expiresAt).getTime();
  if (now > expiresAt) {
    g.closedAt = new Date().toISOString();
    g.closeReason = "expired";
    store.history.push(g);
    store.activeGiveaway = null;
    writeStore(store);
    return;
  }

  const maxAttempts = g.maxAttempts ?? 3;
  if (!g.attemptsByUser) {
    g.attemptsByUser = {};
  }
  const currentAttempts = g.attemptsByUser[message.author.id] ?? 0;
  if (currentAttempts >= maxAttempts) {
    await message.reply(
      `Tu as deja utilise tes **${maxAttempts} essais**. Bonne chance pour la prochaine video !`,
    );
    return;
  }

  const enteredCode = message.content.trim();
  const updatedAttempts = currentAttempts + 1;
  g.attemptsByUser[message.author.id] = updatedAttempts;
  writeStore(store);

  if (enteredCode !== g.code) {
    const remainingAttempts = maxAttempts - updatedAttempts;
    if (remainingAttempts > 0) {
      await message.reply(
        `Code incorrect. Il te reste **${remainingAttempts} essai(s)** sur **${maxAttempts}**.`,
      );
    } else {
      await message.reply(
        `Code incorrect. Tu as utilise tes **${maxAttempts} essais** pour cette video.`,
      );
    }
    return;
  }

  g.winner = {
    userId: message.author.id,
    tag: message.author.tag,
    messageId: message.id,
    wonAt: new Date().toISOString(),
  };
  g.closedAt = new Date().toISOString();
  g.closeReason = "winner_found";

  store.history.push(g);
  store.activeGiveaway = null;
  writeStore(store);

  const winnerEmbed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Bravo ! Tu as gagne !")
    .setDescription(
      `${message.author}, tu as ete le plus rapide et tu remportes **${g.reward}** !`,
    )
    .addFields(
      { name: "Video", value: `${g.video}` },
      { name: "Heure de victoire", value: `${formatDate(g.winner.wonAt)}` },
    )
    .setFooter({ text: "Un admin va te contacter pour la remise." });

  await message.reply({ embeds: [winnerEmbed] });

  const winnersChannel = await client.channels.fetch(g.winnersChannelId).catch(() => null);
  if (winnersChannel && winnersChannel.isTextBased()) {
    const publicWinnerEmbed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("Nouveau gagnant !")
      .setDescription(`${message.author} a trouve le code en premier.`)
      .addFields(
        { name: "Video", value: `${g.video}` },
        { name: "Recompense", value: `**${g.reward}**` },
        { name: "Heure", value: `${formatDate(g.winner.wonAt)}` },
      );

    await winnersChannel.send({ embeds: [publicWinnerEmbed] });
  }
});

client.login(process.env.DISCORD_TOKEN);

client.on("error", (error) => {
  console.error("[CLIENT_ERROR]", error);
});
