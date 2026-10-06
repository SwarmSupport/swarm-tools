// Curated domain suffixes from blackmatrix7/ios_rule_script rule/Surge lists.
// Keep these as bare domains: the UI, routing rules, and hosts integration share them.
const presetDomains = {
  discord: ['dis.gd', 'discord-activities.com', 'discord-attachments-uploads-prd.storage.googleapis.com', 'discord.co', 'discord.com', 'discord.design', 'discord.dev', 'discord.gg', 'discord.gift', 'discord.gifts', 'discord.media', 'discord.new', 'discord.store', 'discord.tools', 'discordactivities.com', 'discordapp.com', 'discordapp.io', 'discordapp.net', 'discordapp.page.link', 'discordcdn.com', 'discordmerch.com', 'discordpartygames.com', 'discordsays.com', 'discordstatus.com'],
  duckduckgo: ['ddg.co', 'ddg.gg', 'ddh.gg', 'dgg.gg', 'duck.ai', 'duck.co', 'duck.com', 'duckduckco.com', 'duckduckco.de', 'duckduckgo.ca', 'duckduckgo.co', 'duckduckgo.co.uk', 'duckduckgo.com', 'duckduckgo.com.mx', 'duckduckgo.com.tw', 'duckduckgo.de', 'duckduckgo.dk', 'duckduckgo.in', 'duckduckgo.jp', 'duckduckgo.ke', 'duckduckgo.mx', 'duckduckgo.nl', 'duckduckgo.org', 'duckduckgo.pl', 'duckduckgo.sg', 'duckduckgo.uk', 'duckgo.com', 'ducksear.ch', 'dukgo.com'],
  facebook: ['facebook.com', 'facebook.net', 'facebook.org', 'facebook.tv', 'facebooklive.com', 'facebookmail.com', 'fb.com', 'fb.me', 'fbcdn-a.akamaihd.net', 'fbcdn.com', 'fbcdn.net', 'fbmessenger.com', 'fbsbx.com', 'fbsbx.net', 'fburl.com', 'm.me', 'messenger.com'],
  instagram: ['cdninstagram.com', 'instagr.am', 'instagram.com'],
  github: ['dependabot.com', 'ghcr.io', 'git.io', 'github.blog', 'github.com', 'github.community', 'github.dev', 'github.io', 'githubapp.com', 'githubassets.com', 'githubcopilot.com', 'githubnext.com', 'githubpreview.dev', 'githubstatus.com', 'githubusercontent.com', 'repo.new'],
  huggingface: ['huggingface.co', 'hf.co', 'xethub.hf.co'],
  ao3: ['archiveofourown.org', 'ao3.org'],
  pixiv: ['booth.pm', 'fanbox.cc', 'pixiv.cat', 'pixiv.co.jp', 'pixiv.me', 'pixiv.net', 'pixiv.org', 'pximg.net'],
  steam: ['s.team', 'steam-api.com', 'steam-chat.com', 'steam.tv', 'steambroadcast.akamaized.net', 'steamcdn-a.akamaihd.net', 'steamchina.com', 'steamcommunity-a.akamaihd.net', 'steamcommunity.com', 'steamcontent.com', 'steamdeck.com', 'steamgames.com', 'steammobile.akamaized.net', 'steampipe-kr.akamaized.net', 'steampipe-partner.akamaized.net', 'steampipe.akamaized.net', 'steampowered.com', 'steamserver.net', 'steamstat.us', 'steamstatic.com', 'steamstore-a.akamaihd.net', 'steamusercontent-a.akamaihd.net', 'steamusercontent.com', 'steamuserimages-a.akamaihd.net', 'steamvideo-a.akamaihd.net', 'valvesoftware.com'],
  twitch: ['ext-twitch.tv', 'jtvnw.net', 'live-video.net', 'ttvnw.net', 'twitch-ext.rootonline.de', 'twitch.tv', 'twitchcdn.net', 'twitchsvc.net'],
  x: ['ads-twitter.com', 'cms-twdigitalassets.com', 'grok.com', 'periscope.tv', 'pscp.tv', 't.co', 'tellapart.com', 'tweetdeck.com', 'twimg.co', 'twimg.com', 'twimg.org', 'twitpic.com', 'twitter.biz', 'twitter.com', 'twitter.jp', 'twittercommunity.com', 'twitterflightschool.com', 'twitterinc.com', 'twitteroauth.com', 'twitterstat.us', 'twtrdns.net', 'twttr.com', 'twttr.net', 'twvid.com', 'vine.co', 'x.com']
};

if (typeof module !== 'undefined') module.exports = presetDomains;
