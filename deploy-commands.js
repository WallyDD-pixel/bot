require("dotenv").config();

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const REQUIRED_ENV = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[CONFIG] Variable manquante: ${key}`);
    process.exit(1);
  }
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

async function main() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    { body: commands },
  );
  console.log("Commandes slash deployees avec succes.");
}

main().catch((error) => {
  console.error("Erreur de deploiement des commandes:", error);
  process.exit(1);
});
