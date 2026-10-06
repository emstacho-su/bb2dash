#!/bin/bash
#
# Default-deny egress for the Workspace container (brief 102 task 12; P-88).
#
# Run once, as root, by docker/workspace/entrypoint.sh before any Node or `claude` process starts.
# When it exits 0 the container can reach four names, each on one TCP port, and nothing else:
#
#   api.anthropic.com                   tcp/443   the `claude` CLI, on Stack's subscription token
#   goultdzqcavefcgnifdy.supabase.co    tcp/443   the materials MCP server (the bb2dash project's API)
#   the host of workspace_runner_db_url tcp/5432  the runner's own queue connection (the session pooler)
#   the host of harness_database_url    tcp/5432  the rag MCP server (the harness store)
#
# The allowlist is by address, and each of these addresses serves other tenants too (a CDN's edge,
# a shared pooler): the port rule narrows what an allowed address can be asked, not who answers.
#
# A fork, not an import, of bb2dash-stack's .devcontainer/init-firewall.sh and firewall-lib.sh
# (eb71e8b; themselves forked from anthropics/claude-code's dev container).
#
# Kept from it:
#   * one run per container start: a `mkdir` claim in /dev/shm, and a second run is refused before
#     it changes anything;
#   * any exit before the last check leaves deny-all except loopback, never half-built rules;
#   * DNS may go only to the resolvers in /etc/resolv.conf;
#   * IPv6 is closed;
#   * the end check: example.com is refused and api.anthropic.com answers.
#
# Dropped from it:
#   * GitHub's ranges, their fetch, their cache and the committed list they were checked against;
#   * sudo: the entrypoint is root already, and no sudoers rule exists in this image;
#   * the accept rule for the container's own Docker /24: this container may reach neither its
#     gateway nor the Docker host, so the sync container's login page (noVNC, port 6080) is out
#     of reach whatever network it sits on;
#   * the refresh loop: no root process stays running after this script.
#
# New here:
#   * a port rule (102a, PM rulings T1 c): the two HTTPS names are allowed on tcp/443 only and the pooler
#     addresses on tcp/5432 only, each kind in a set of its own. No address is allowed on every
#     port, and nothing but TCP leaves (DNS to the resolvers apart);
#   * the two database hosts are read from the secret files, and each must end
#     .pooler.supabase.com and name port 5432 or no port (102a, PM rulings U2); anything else
#     stops the start. A connection string is never printed, whole or in part;
#   * each name is resolved once and pinned in /etc/hosts, so every later connection uses the
#     address that was allowed (a pooler name answers a different address per lookup). A pin that
#     goes stale is healed by a restart, which runs this script again: the runner's database
#     watchdog exits for that, and `docker compose restart workspace` does it by hand.
#
# It reads nothing the node user can write: not the workspace-claude-home volume, not the
# environment it was started with (PATH and HOME are set below), not ~/.curlrc or ~/.digrc.
#
# What it prints, into the container's log (102a, PM rulings U2), and nothing more:
#   * the two fixed host names above, and the two fixed URLs of the end check
#     (https://example.com and https://api.anthropic.com);
#   * the name of each database secret and, once its host has passed the suffix and port rules,
#     that pooler's host name;
#   * the address of each resolver in /etc/resolv.conf that DNS is allowed to (Docker's own,
#     127.0.0.11), the one port each name is allowed on and how many addresses it has;
#   * a fixed sentence for each step, and for a refusal a fixed sentence beside the secret's or
#     the host's name.
# It never prints a user, a password, a database name, a query string or a whole connection
# string; of a secret it refused it prints the secret's name and nothing of its value; and it
# never prints the address of an allowed host.

set -euo pipefail
IFS=$'\n\t'

# Root's own, fixed. The image's PATH ends in the npm prefix the node user owns: a program planted
# there must never run as root. HOME keeps curl and dig away from node's home.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/root
export LC_ALL=C

# The two sets iptables allows outbound TCP to, and the one port each is allowed on: the addresses
# of the HTTPS names, and the addresses of the database poolers. Their type is the dev firewall's
# (hash:net, which is known to work under Docker Desktop on stack-laptop); this script only ever
# adds single addresses.
readonly HTTPS_SET=workspace-https
readonly HTTPS_PORT=443
readonly POSTGRES_SET=workspace-postgres
readonly POSTGRES_PORT=5432
readonly FIREWALL_SET_TYPE=hash:net
# Claimed (mkdir) by the one run a container start may make. /dev/shm is the container's own tmpfs:
# a restart empties it. The folder is root's and /dev/shm is sticky, so node cannot remove it.
readonly FIREWALL_RUN_MARKER=/dev/shm/bb2dash-workspace-firewall.up
# The resolvers DNS may go to, and the file the pins are written into. Both are root's.
readonly RESOLV_CONF=/etc/resolv.conf
readonly HOSTS_FILE=/etc/hosts
# Where compose mounts the secret files, read-only.
readonly SECRETS_DIR=/run/secrets
# The kernel's list of this container's IPv6 addresses; absent when it has no IPv6 at all.
readonly INET6_ADDRESSES=/proc/net/if_inet6
# Ends every line this script adds to /etc/hosts, so the next start can take its own lines out.
readonly PIN_MARK='# pinned by init-firewall.sh'

# The two names every start allows, on tcp/443 (brief 102, "Non-root and egress").
readonly -a HTTPS_HOSTS=(
  "api.anthropic.com"
  "goultdzqcavefcgnifdy.supabase.co"
)
# The secrets whose host is allowed too, on tcp/5432, and what such a host must end with.
readonly -a DSN_SECRETS=(
  "workspace_runner_db_url"
  "harness_database_url"
)
readonly DSN_HOST_SUFFIX=.pooler.supabase.com
# Whole labels of letters, digits and hyphens, then the suffix: `evilpooler.supabase.com` and
# `x.pooler.supabase.com.example.org` both fail it.
readonly DSN_HOST_RE='^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+pooler\.supabase\.com$'
readonly HOSTNAME_MAX_LENGTH=253
readonly IPV4_RE='^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$'

readonly DNS_TIMEOUT_S=5
readonly DNS_TRIES=2
readonly CONNECT_TIMEOUT_S=5
readonly REQUEST_TIMEOUT_S=15
# The end check: one address that must be refused, one that must answer.
readonly DENIED_PROBE=https://example.com
readonly ALLOWED_PROBE=https://api.anthropic.com

readonly EX_ALREADY_RAISED=75

fail() {
  echo "ERROR: $*"
  exit 1
}

# deny_all: what a failed start leaves behind. Loopback stays, so Docker's healthcheck and the
# embedded resolver's own socket still work; nothing leaves the container.
deny_all() {
  set +e
  iptables -F
  iptables -X
  iptables -P INPUT DROP
  iptables -P FORWARD DROP
  iptables -P OUTPUT DROP
  iptables -A INPUT -i lo -j ACCEPT
  iptables -A OUTPUT -o lo -j ACCEPT
  ip6tables -F 2>/dev/null
  ip6tables -P INPUT DROP 2>/dev/null
  ip6tables -P FORWARD DROP 2>/dev/null
  ip6tables -P OUTPUT DROP 2>/dev/null
  echo "Firewall left at deny-all except loopback"
}

# dsn_host <file>: the host of the Postgres URL in <file>, lower case, on stdout. On a refusal it
# prints why and returns 1. The reasons are fixed sentences: no part of the URL is ever printed,
# because a URL that parses badly can put a piece of its password where the host should be.
dsn_host() {
  local file="$1" dsn rest authority hostport host
  if [ ! -f "$file" ] || [ ! -r "$file" ]; then
    echo "the secret file is missing or not readable"
    return 1
  fi
  # Without the byte-order mark, CR or LF a Windows editor leaves behind.
  dsn="$(sed '1s/^\xEF\xBB\xBF//' "$file" | tr -d '\r\n')"
  if [ -z "$dsn" ]; then
    echo "the secret file is empty"
    return 1
  fi
  rest="${dsn,,}"
  if [[ ! "$rest" =~ ^postgres(ql)?:// ]]; then
    echo "it is not a postgres:// or postgresql:// URL"
    return 1
  fi
  # scheme://[user[:password]@]host[:port][/database][?parameters]: the authority ends at the
  # first `/`, `?` or `#`, and the user part ends at its LAST `@`, as a URL parser reads it.
  rest="${dsn#*://}"
  authority="${rest%%[/?#]*}"
  hostport="${authority##*@}"
  if [[ "$hostport" == \[* ]]; then
    echo "its host is an address, not a name ending $DSN_HOST_SUFFIX"
    return 1
  fi
  host="${hostport%%:*}"
  host="${host,,}"
  if [ "${#host}" -gt "$HOSTNAME_MAX_LENGTH" ] || [[ ! "$host" =~ $DSN_HOST_RE ]]; then
    echo "its host does not end $DSN_HOST_SUFFIX"
    return 1
  fi
  # The port (PM ruling U2). The pooler's addresses are allowed on tcp/5432 only, so a URL that
  # names another port (6543, the transaction pooler's) could never connect: the start stops here
  # instead of at the first query. A URL that names no port means 5432, Postgres's default. What
  # follows the first colon is compared as text, so `05432`, an empty port and `5432:1` all fail.
  if [[ "$hostport" == *:* ]] && [ "${hostport#*:}" != "$POSTGRES_PORT" ]; then
    echo "its port is not $POSTGRES_PORT"
    return 1
  fi
  printf '%s\n' "$host"
}

# is_public_ipv4 <address>: false for an address that is loopback, private, carrier-grade NAT,
# link-local, multicast or reserved. None of the four names lives there, and allowing one would
# open the Docker host or the home network the moment a resolver answered wrongly.
is_public_ipv4() {
  local first second _third _fourth
  IFS=. read -r first second _third _fourth <<<"$1"
  first=$((10#$first))
  second=$((10#$second))
  if ((first == 0 || first == 10 || first == 127 || first >= 224)); then return 1; fi
  if ((first == 100 && second >= 64 && second <= 127)); then return 1; fi
  if ((first == 169 && second == 254)); then return 1; fi
  if ((first == 172 && second >= 16 && second <= 31)); then return 1; fi
  if ((first == 192 && second == 168)); then return 1; fi
  return 0
}

# resolve_once <name>: the A records of ONE answer from this container's resolvers, one a line.
# dig asks DNS only (never /etc/hosts, so an old pin cannot answer for itself), and -r keeps it
# from reading a .digrc.
resolve_once() {
  dig -r +noall +answer +time="$DNS_TIMEOUT_S" +tries="$DNS_TRIES" A "$1" | awk '$4 == "A" {print $5}'
}

# allow_host <set> <name>: resolve the name once, put every address of that answer in the set and
# pin each in /etc/hosts. Prints how many addresses it allowed on stdout; on a failure it says why
# on stderr and returns 1. Every step is checked by hand: the caller tests this function's result,
# and a shell does not stop on a failed command inside a function whose result is being tested.
allow_host() {
  local set_name="$1" name="$2" answers address count=0
  answers="$(resolve_once "$name" || true)"
  while read -r address; do
    if [ -z "$address" ]; then continue; fi
    if [[ ! "$address" =~ $IPV4_RE ]]; then
      echo "ignoring an answer for $name that is not an IPv4 address" >&2
      continue
    fi
    if ! is_public_ipv4 "$address"; then
      echo "ignoring an answer for $name that is not a public address" >&2
      continue
    fi
    if ! ipset add -exist "$set_name" "$address"; then
      echo "an address of $name could not be added to the set" >&2
      return 1
    fi
    if ! printf '%s %s %s\n' "$address" "$name" "$PIN_MARK" >>"$HOSTS_FILE"; then
      echo "$name could not be pinned in $HOSTS_FILE" >&2
      return 1
    fi
    count=$((count + 1))
  done <<<"$answers"
  if [ "$count" -eq 0 ]; then
    echo "$name did not resolve to a public IPv4 address" >&2
    return 1
  fi
  echo "$count"
}

# allow_names <set> <port> <name>...: allow_host for each name. The first that cannot be allowed
# stops the start.
allow_names() {
  local set_name="$1" port="$2" name count
  shift 2
  for name in "$@"; do
    if ! count="$(allow_host "$set_name" "$name")"; then
      fail "$name could not be allowed (the line above says why)"
    fi
    echo "Allowed $name on tcp/$port ($count address(es), pinned in $HOSTS_FILE)"
  done
}

main() {
  local secret host reason resolver kept off_loopback
  local -a postgres_hosts=()
  local -A seen=()

  # 0. One run per container start. A second run would flush the rules while the first run's
  #    OUTPUT DROP still stands and then fail to resolve anything, so it is refused before it
  #    changes anything. The claim is a mkdir, which fails on anything already there and follows
  #    no link; a deliberate re-raise is a container restart, which empties /dev/shm.
  if ! mkdir "$FIREWALL_RUN_MARKER" 2>/dev/null; then
    echo "ERROR: the firewall was already raised in this container ($FIREWALL_RUN_MARKER exists): a second run is refused; restart the container to raise it again"
    exit "$EX_ALREADY_RAISED"
  fi

  # From here on, any exit before the firewall is verified (a refused secret, a name that does
  # not resolve, a failed check, any failed command) leaves deny-all except loopback, and is
  # never reported as a success.
  FIREWALL_UP=0
  trap 'status=$?; if [ "$FIREWALL_UP" != 1 ]; then deny_all; [ "$status" != 0 ] || status=1; fi; exit "$status"' EXIT

  # 1. The database hosts, before any rule is touched. Each secret must be a Postgres URL whose
  #    host ends .pooler.supabase.com; a host of any other kind would put an address of someone
  #    else's choosing on the allowlist, so the start stops instead.
  for secret in "${DSN_SECRETS[@]}"; do
    if ! host="$(dsn_host "$SECRETS_DIR/$secret")"; then
      reason="$host"
      fail "$secret: $reason"
    fi
    # Both database secrets usually name the same pooler: one lookup, one pin.
    if [ -z "${seen[$host]:-}" ]; then
      seen[$host]=1
      postgres_hosts+=("$host")
    fi
    echo "The host of $secret ends $DSN_HOST_SUFFIX"
  done

  # 2. A known starting point: no rule but Docker's own DNS redirect, read before the flush and
  #    put back after it (the embedded resolver listens on 127.0.0.11 behind a NAT rule).
  local docker_dns_rules
  docker_dns_rules="$(iptables-save -t nat | grep "127\.0\.0\.11" || true)"
  iptables -F
  iptables -X
  iptables -t nat -F
  iptables -t nat -X
  iptables -t mangle -F
  iptables -t mangle -X
  ipset destroy "$HTTPS_SET" 2>/dev/null || true
  ipset destroy "$POSTGRES_SET" 2>/dev/null || true
  if [ -n "$docker_dns_rules" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$docker_dns_rules" | xargs -L 1 iptables -t nat
  else
    echo "No Docker DNS rules to restore"
  fi

  # 3. Loopback (the stdio MCP servers and the healthcheck never leave it; the embedded resolver
  #    is on it), and DNS to this container's own resolvers only, never to a server of the
  #    caller's choosing.
  iptables -A INPUT -i lo -j ACCEPT
  iptables -A OUTPUT -o lo -j ACCEPT
  while read -r resolver; do
    if [[ ! "$resolver" =~ $IPV4_RE ]]; then
      echo "Skipping a resolver that is not an IPv4 address"
      continue
    fi
    echo "Allowing DNS to $resolver"
    iptables -A OUTPUT -p udp -d "$resolver" --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp -d "$resolver" --dport 53 -j ACCEPT
  done < <(awk '$1 == "nameserver" {print $2}' "$RESOLV_CONF")

  # 4. The allowlist. Each name is resolved once, now, while this script is the only thing
  #    running; its addresses go into the set of its kind and into /etc/hosts. Lines an earlier
  #    start pinned are taken out first, so a name is never left on an address that is no longer
  #    in a set. /etc/hosts is a mounted file: it is rewritten in place, never replaced.
  ipset create "$HTTPS_SET" "$FIREWALL_SET_TYPE"
  ipset create "$POSTGRES_SET" "$FIREWALL_SET_TYPE"
  if [ ! -f "$HOSTS_FILE" ] || [ ! -w "$HOSTS_FILE" ]; then
    fail "$HOSTS_FILE cannot be written, so no name can be pinned"
  fi
  kept="$(grep -v -F -- "$PIN_MARK" "$HOSTS_FILE" || true)"
  printf '%s\n' "$kept" >"$HOSTS_FILE"
  allow_names "$HTTPS_SET" "$HTTPS_PORT" "${HTTPS_HOSTS[@]}"
  allow_names "$POSTGRES_SET" "$POSTGRES_PORT" "${postgres_hosts[@]}"

  # 5. Default deny. Replies to what this container opened come back in. A new connection goes
  #    out only as TCP, to an address in a set, on that set's one port: 443 for the HTTPS names,
  #    5432 for the poolers. Everything else is refused at once (a reject, so a caller gets an
  #    error instead of waiting out a timeout): another port on an allowed address, any other
  #    address, UDP and ICMP. There is no rule for the Docker network this container sits on: its
  #    gateway and the Docker host are refused like any other address.
  iptables -P INPUT DROP
  iptables -P FORWARD DROP
  iptables -P OUTPUT DROP
  iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
  iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
  iptables -A OUTPUT -p tcp --dport "$HTTPS_PORT" -m set --match-set "$HTTPS_SET" dst -j ACCEPT
  iptables -A OUTPUT -p tcp --dport "$POSTGRES_PORT" -m set --match-set "$POSTGRES_SET" dst -j ACCEPT
  iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

  # 6. IPv6: loopback only. A container with an IPv6 address and no ip6tables is an open door, so
  #    when the rules cannot be set the start goes on only if the kernel lists no IPv6 address
  #    off loopback for this container (link-local counts: it reaches the Docker host).
  if ip6tables -F 2>/dev/null &&
    ip6tables -X &&
    ip6tables -P INPUT DROP &&
    ip6tables -P FORWARD DROP &&
    ip6tables -P OUTPUT DROP &&
    ip6tables -A INPUT -i lo -j ACCEPT &&
    ip6tables -A OUTPUT -o lo -j ACCEPT; then
    echo "IPv6 closed (loopback only)"
  elif [ ! -e "$INET6_ADDRESSES" ]; then
    echo "No IPv6 here (ip6tables unavailable and the kernel lists no IPv6 addresses)"
  elif [ ! -r "$INET6_ADDRESSES" ]; then
    fail "ip6tables could not close IPv6 and $INET6_ADDRESSES cannot be read"
  else
    # One awk reads the whole list and prints a count. Not a pipe into a reader that stops at the
    # first line: under pipefail the writer's broken pipe would fail the pipeline, and a found
    # address would read as none. Anything but a clean 0 stops the start.
    off_loopback="$(awk '$NF != "lo" {found++} END {print found + 0}' "$INET6_ADDRESSES")"
    if [ "$off_loopback" != 0 ]; then
      fail "this container has an IPv6 address off loopback and ip6tables could not close it"
    fi
    echo "No IPv6 here (ip6tables unavailable and no IPv6 address off loopback)"
  fi

  # 7. The end check, through the rules as they now stand. -q keeps curl from reading a .curlrc.
  echo "Firewall configuration complete"
  echo "Verifying firewall rules..."
  if curl -q -s -o /dev/null --connect-timeout "$CONNECT_TIMEOUT_S" --max-time "$REQUEST_TIMEOUT_S" "$DENIED_PROBE"; then
    fail "Firewall verification failed - was able to reach $DENIED_PROBE"
  fi
  echo "Firewall verification passed - unable to reach $DENIED_PROBE as expected"
  if ! curl -q -s -o /dev/null --connect-timeout "$CONNECT_TIMEOUT_S" --max-time "$REQUEST_TIMEOUT_S" "$ALLOWED_PROBE"; then
    fail "Firewall verification failed - unable to reach $ALLOWED_PROBE"
  fi
  echo "Firewall verification passed - able to reach $ALLOWED_PROBE as expected"

  # 8. Raised. No refresh loop and no other root process is left behind.
  FIREWALL_UP=1
  echo "Firewall raised: $((${#HTTPS_HOSTS[@]} + ${#postgres_hosts[@]})) name(s) allowed"
}

# Run only when executed, so the functions above can be read into a shell and tried on their own.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
