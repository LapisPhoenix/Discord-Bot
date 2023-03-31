import { config } from "dotenv";
import { readdirSync, lstatSync } from "fs";
import { join } from "path";
import { start, tryReward } from './util/';
import { logMessage, logDiscordEvent, logChannelID } from "./lib/logging";

import {
  Client,
  Events,
  GatewayIntentBits,
  Collection,
  TextChannel
} from "discord.js";
config();
const PREFIX = "+";
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});
const cmdPath = join(__dirname, "commands");
const commandFiles = readdirSync(cmdPath);
const textCommandFiles = readdirSync(join(cmdPath, "text"));
const commands = new Collection<string, any>();
const textCommands = new Collection<string, any>();

let logChannel: TextChannel;


// load 'text' commands (such as ./exec) located in src/commands/text
textCommandFiles.forEach(async (file) => {
  const command = (await import(join(cmdPath, "text", file))).default;

  if (command.execute && command.name) {
    textCommands.set(command.name, command);
  }
});


// load slash commands by going through each file in src/commands
commandFiles.forEach(async (file) => {
  if ((await lstatSync(join(cmdPath, file))).isDirectory()) return; // skip sub-folders

  const command = (await import(join(cmdPath, file))).default;
  if (command.data && command.execute) {
    console.log("Loaded command: " + command.data.name);
    commands.set(command.data.name, command);
  }
});


// if a slash command was created, run the proper one
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    try {
      await command.execute(interaction);
    } catch (error) {
      await interaction.reply({
        content: "There was an error: " + error,
      });
    }
  }
});

// filter for text commands
client.on(Events.MessageCreate, async (event) => {
  /* support either: 
  ./cmd <stuff>
  OR
  ./cmd
  <stuff>
  */

  if (event.content.startsWith(PREFIX)) {
    const spaceIndex = event.content.indexOf(" ");
    const newLineIndex = event.content.indexOf("\n");
    if (spaceIndex == -1 && newLineIndex == -1) {
      await event.reply("Command not found, or no arguments were provided.");
      return;
    }
    const index =
      spaceIndex == -1
        ? newLineIndex
        : newLineIndex == -1
          ? spaceIndex
          : newLineIndex;
    const textCommandName = event.content.substring(PREFIX.length, index);
    const command = textCommands.get(textCommandName);
    try {
      await command.execute(event);
    } catch (error) {
      await event.reply({
        content: "There was an error: " + error,
      });
    }
  } else {
    tryReward(event.author.id);
  };
});

client.on('voiceStateUpdate', (oldState, newState) => {
  logChannel = client.channels.cache.get(logChannelID) as TextChannel;  // Typescript is annoying sometimes
  if (oldState.channelId == newState.channelId) return; // Ignore if channel didn't change 
  if (!oldState.channelId && newState.channelId) {  // User joined a channel
    let embed = logDiscordEvent(`${newState.member.user.username} joined a voice channel`);

    embed.addFields(
      { name: "User", value: `<@${newState.member.user.id}>`, inline: true },
      { name: "Channel", value: `<#${newState.channelId}>`, inline: true },
    )

    logChannel.send({ embeds: [embed] });
  } else if (oldState.channelId && !newState.channelId) { // User left a channel
    let embed = logDiscordEvent(`${oldState.member.user.username} left a voice channel`);

    embed.addFields(
      { name: "User", value: `<@${oldState.member.user.id}>`, inline: true },
      { name: "Channel", value: `<#${oldState.channelId}>`, inline: true },
    )

    logChannel.send({ embeds: [embed] });
  } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {  // User moved channels
    let embed = logDiscordEvent(`${newState.member.user.username} moved voice channels`);

    embed.addFields(
      { name: "User", value: `<@${newState.member.user.id}>`, inline: true },
      { name: "From", value: `<#${oldState.channelId}>`, inline: true },
      { name: "To", value: `<#${newState.channelId}>`, inline: true },
    )

    logChannel.send({ embeds: [embed] });
  }
});

client.on('guildMemberAdd', member => {
  logChannel = client.channels.cache.get(logChannelID) as TextChannel;

  let embed = logDiscordEvent(`${member.user.username} joined the server`);

  embed.addFields(
    { name: "User", value: `<@${member.user.id}>`, inline: true },
  )

  logChannel.send({ embeds: [embed] });
});


client.on('guildMemberRemove', member => {
  logChannel = client.channels.cache.get(logChannelID) as TextChannel;

  let embed = logDiscordEvent(`${member.user.username} left the server`);

  embed.addFields(
    { name: "User", value: `<@${member.user.id}>`, inline: true },
  )

  logChannel.send({ embeds: [embed] });
});

client.on('messageDelete', message => {
  logChannel = client.channels.cache.get(logChannelID) as TextChannel;

  let embed = logDiscordEvent(`${message.author.username} deleted a message`);

  embed.addFields(
    { name: "User", value: `<@${message.author.id}>`, inline: true },
    { name: "Message", value: `\`\`\`${message.content}\`\`\``, inline: false },
  )

  logChannel.send({ embeds: [embed] });

});

client.on('messageUpdate', (oldMessage, newMessage) => {
  logChannel = client.channels.cache.get(logChannelID) as TextChannel;

  let embed = logDiscordEvent(`${oldMessage.author.username} edited a message`);

  embed.addFields(
    { name: "User", value: `<@${oldMessage.author.id}>`, inline: true },
    { name: "Message Link", value: `[Click Here](https://discord.com/channels/${oldMessage.guild.id}/${oldMessage.channel.id}/${oldMessage.id})`, inline: true },
    { name: "Old Message", value: `\`\`\`${oldMessage.content}\`\`\``, inline: false },
    { name: "New Message", value: `\`\`\`${newMessage.content}\`\`\``, inline: false },
  )

  logChannel.send({ embeds: [embed] });

});

client.login(process.env.TOKEN).then(s => {
  console.log("Logged in as " + client.user.username);
})


start();
