<script>
	import Navitem from './Navitem.svelte';
	import QuickItem from './QuickItem.svelte';
	import Home from '$lib/components/feather/home.svelte';
	import Bell from '$lib/components/feather/bell.svelte';
	import Settings from '$lib/components/feather/settings.svelte';
	import Lock from '$lib/components/feather/lock.svelte';
	import Search from '$lib/components/feather/search.svelte';
	import Intake from '$lib/components/feather/intake.svelte';
	import Ddt from '$lib/components/feather/ddt.svelte';
	import Print from '$lib/components/feather/print.svelte';
	import Users from '$lib/components/feather/users.svelte';
	import Reorder from '$lib/components/feather/reorder.svelte';
	import Sets from '$lib/components/feather/sets.svelte';
	import Legal from '$lib/components/feather/legal.svelte';
	import { navState } from '$lib/stores';
	import { onMount } from 'svelte';
	import * as api from '$lib/api';
	import { debugMode as t } from '$lib/i18n-debug';

	let isAdmin = false;
	let isDirector = false;
	let currentUser = null;

	onMount(async () => {
		try {
			const response = await api.get('/api/user');
			if (response.ok) {
				currentUser = await response.json();
				isAdmin = currentUser?.userType === 'admin';
				isDirector = currentUser?.isDirector === true;
				console.log('Current user:', currentUser);
			}
		} catch (error) {
			console.error('Error fetching user:', error);
		}
	});

	$: currentRoute = $navState;
	$: navItems = [
		{
			label: $t('Nav.home'),
			icon: Home,
			active: currentRoute === 'Home',
			disabled: false,
			href: isAdmin ? '/admin' : '/patient'
		},
		{ label: $t('Nav.updates'), icon: Bell, active: currentRoute === 'Updates', disabled: true },
		{
			label: $t('Nav.settings'),
			icon: Settings,
			active: currentRoute === 'Settings',
			disabled: true
		},
		{
			label: $t('Nav.logout'),
			icon: Lock,
			active: currentRoute === 'Logout',
			disabled: false,
			isLogout: true
		}
	];
	$: quickActions = [
		...(isAdmin
			? [
					{
						label: $t('Nav.patient_list'),
						icon: Users,
						active: currentRoute === 'Patient List',
						disabled: false,
						href: '/admin/view-patients'
					},
					{
						label: $t('Nav.patient_intake'),
						icon: Intake,
						active: currentRoute === 'Patient Intake',
						disabled: false
					},
					{
						label: $t('Nav.interview_admin'),
						icon: Ddt,
						active: currentRoute === 'Interview Admin',
						disabled: false
					},
					{
						label: $t('Nav.reports'),
						icon: Print,
						active: currentRoute === 'Reports' || currentRoute === 'PrintReport',
						disabled: false
					}
				]
			: [])
	];
</script>

<nav
	class="lg:h-[100dvh] w-[100dvw] bottom-0 right-0 lg:right-auto fixed z-50 lg:sticky lg:top-0 left-0 lg:w-[16rem] lg:px-4 lg:py-5 py-4 bg-white flex-col justify-start items-start gap-[3rem] shadow-Main_Shadow_L overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto {currentRoute ===
	'Question'
		? 'hidden'
		: 'flex'}"
>
	<div class="flex-col w-full justify-start items-start hidden lg:flex">
		<div><img class="w-fit" src="/logos/psy_match.png" alt="PSY MATCH" /></div>
		<div><img class="w-fit" src="/logos/cct.png" alt="CCT" /></div>
	</div>
	<div
		class="lg:flex-col justify-evenly lg:justify-start items-between lg:items-start gap-[1.68rem] flex w-full lg:w-fit"
	>
		{#each navItems as item}
			<Navitem
				label={item.label}
				active={item.active}
				disabled={item.disabled}
				href={item.href}
				isLogout={item.isLogout}
			>
				<svelte:component this={item.icon} />
			</Navitem>
		{/each}
	</div>
	{#if isAdmin}
		<div
			class="lg:flex-col justify-evenly lg:justify-start items-between lg:items-start gap-[1rem] flex w-full lg:w-fit"
		>
			<p class="text-[0.875rem] font-bold text-[#6F6F6F]">{$t('Nav.quick_actions')}</p>
			{#each quickActions as item}
				<QuickItem
					label={item.label}
					active={item.active}
					disabled={item.disabled}
					href={item.href}
				>
					<svelte:component this={item.icon} />
				</QuickItem>
			{/each}
		</div>
	{/if}

	{#if isDirector}
		<div
			class="lg:flex-col justify-evenly lg:justify-start items-between lg:items-start gap-[1rem] flex w-full lg:w-fit"
		>
			<p class="text-[0.875rem] font-bold text-[#6F6F6F]">{$t('Nav.director_mode')}</p>
			<QuickItem
				label={$t('Nav.view_admins')}
				active={currentRoute === 'View Admins'}
				disabled={false}
				href="/admin/view-admins"
			>
				<svelte:component this={Users} />
			</QuickItem>
			<QuickItem label={$t('Nav.add_admin')} active={currentRoute === 'Add Admin'} disabled={false}>
				<svelte:component this={Users} />
			</QuickItem>
			<QuickItem
				label={$t('Nav.reorder_interviews')}
				active={currentRoute === 'Reorder Interviews'}
				disabled={false}
				href="/admin/rearrange-interviews"
			>
				<svelte:component this={Reorder} />
			</QuickItem>
			<QuickItem
				label={$t('Nav.sets')}
				active={currentRoute === 'Sets'}
				disabled={false}
				href="/admin/sets"
			>
				<svelte:component this={Sets} />
			</QuickItem>
			<QuickItem
				label={$t('Nav.legals')}
				active={currentRoute === 'Legals'}
				disabled={false}
				href="/admin/legals"
			>
				<svelte:component this={Legal} />
			</QuickItem>
		</div>
	{/if}
</nav>
